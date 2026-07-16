/**
 * Automation Engine - Core workflow execution engine
 * Handles triggers, enrollments, and step execution
 */

const emailService = require('./emailService');
const smsService = require('./smsService');
const { randomUUID } = require('node:crypto');
const { workflowColumns, workflowStepColumns, workflowEnrollmentColumns } = require('../routes/workflow-columns');
const { emailTemplateColumns, smsTemplateColumns } = require('../routes/template-columns');
const { normalizeWorkflowTriggerType } = require('../domain/workflowRegistry');
const {
  DEFAULT_WEBHOOK_MAX_REQUEST_BYTES,
  normalizeWorkflowWebhookHeaders,
  parseWorkflowWebhookUrl,
} = require('./workflowWebhookEgress');

const WORKFLOW_WEBHOOK_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_ENROLLMENT_LEASE_SECONDS = 300;

const workflowSideEffectKey = (enrollment, step) => {
  const runAt = new Date(enrollment.enrolled_at);
  if (!enrollment?.id || !enrollment.organization_id || !step?.id || Number.isNaN(runAt.getTime())) {
    throw new Error('Workflow side-effect identity is unavailable');
  }
  return `workflow-${enrollment.id}-${step.id}-${runAt.getTime()}`;
};

const workflowStepLogInput = (step) => ({
  step_type: step.step_type,
  config_keys: Object.keys(step.step_config || {}).sort(),
});

async function enqueueWorkflowSideEffect(client, {
  effectType,
  enrollment,
  payload,
  step,
}) {
  const idempotencyKey = workflowSideEffectKey(enrollment, step);
  const result = await client.query(`
    INSERT INTO workflow_side_effect_outbox (
      idempotency_key, organization_id, enrollment_id, step_id,
      enrollment_run_at, effect_type, payload
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    ON CONFLICT (enrollment_id, step_id, enrollment_run_at) DO UPDATE SET
      idempotency_key = workflow_side_effect_outbox.idempotency_key
    RETURNING id, idempotency_key, status
  `, [
    idempotencyKey,
    enrollment.organization_id,
    enrollment.id,
    step.id,
    new Date(enrollment.enrolled_at).toISOString(),
    effectType,
    JSON.stringify(payload),
  ]);
  return result.rows[0];
}

const workflowEnrollmentLeaseSeconds = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3600
    ? parsed
    : DEFAULT_ENROLLMENT_LEASE_SECONDS;
};

async function claimWorkflowEnrollment(queryable, {
  enrollmentId = null,
  leaseSeconds = DEFAULT_ENROLLMENT_LEASE_SECONDS,
} = {}) {
  const boundedLeaseSeconds = workflowEnrollmentLeaseSeconds(leaseSeconds);
  const claimToken = randomUUID();
  const result = await queryable.query(`
    WITH candidate AS (
      SELECT id
      FROM workflow_enrollments
      WHERE status = 'active'
        AND next_action_at <= CURRENT_TIMESTAMP
        AND ($1::integer IS NULL OR id = $1)
        AND (
          execution_claim_token IS NULL
          OR execution_lease_expires_at <= CURRENT_TIMESTAMP
        )
      ORDER BY next_action_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE workflow_enrollments enrollment SET
      execution_attempt_count = execution_attempt_count + 1,
      execution_claim_token = $2::uuid,
      execution_lease_expires_at =
        CURRENT_TIMESTAMP + ($3::integer * INTERVAL '1 second')
    FROM candidate
    WHERE enrollment.id = candidate.id
    RETURNING
      enrollment.id,
      enrollment.execution_attempt_count,
      enrollment.execution_claim_token,
      enrollment.execution_lease_expires_at
  `, [enrollmentId, claimToken, boundedLeaseSeconds]);
  if (result.rows.length === 0) return null;
  return {
    ...result.rows[0],
    lease_seconds: boundedLeaseSeconds,
  };
}

class AutomationEngine {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Handle an incoming trigger event
   * Finds matching workflows and enrolls contacts
   */
  async handleTrigger(triggerType, data) {
    const normalizedTriggerType = normalizeWorkflowTriggerType(triggerType);
    if (!normalizedTriggerType) {
      return {
        enrolled: 0,
        error: `Unsupported workflow trigger type: ${triggerType}`,
      };
    }
    const { contact, organizationId, ...triggerData } = data;

    if (!contact || !organizationId) {
      console.log('AutomationEngine: Missing contact or organizationId in trigger data');
      return { enrolled: 0 };
    }

    let client;
    try {
      client = await this.pool.connect();

      // Find active workflows matching this trigger type
      const workflows = await client.query(
        `SELECT ${workflowColumns()} FROM workflows
         WHERE organization_id = $1 
         AND trigger_type = $2 
         AND is_active = true`,
        [organizationId, normalizedTriggerType]
      );

      let enrolledCount = 0;

      for (const workflow of workflows.rows) {
        // Check if trigger conditions match
        const shouldEnroll = this.checkTriggerConditions(workflow.trigger_config, triggerData);
        
        if (shouldEnroll) {
          const enrolled = await this.enrollContact(client, workflow.id, contact.id, {
            trigger_type: normalizedTriggerType,
            ...triggerData,
          });
          
          if (enrolled) {
            enrolledCount++;
            // Process first step immediately
            await this.processEnrollment(client, enrolled.id);
          }
        }
      }

      console.log(`AutomationEngine: Trigger ${normalizedTriggerType} - Enrolled ${enrolledCount} workflows`);
      return { enrolled: enrolledCount };
    } catch (error) {
      console.error('AutomationEngine: Error handling trigger:', error);
      return { enrolled: 0, error: error.message };
    } finally {
      client?.release();
    }
  }

  /**
   * Check if trigger conditions match the event data
   */
  checkTriggerConditions(triggerConfig, eventData) {
    if (!triggerConfig || Object.keys(triggerConfig).length === 0) {
      return true; // No conditions = always match
    }

    // Tag-based triggers
    if (triggerConfig.tag_name) {
      if (!eventData.tag || eventData.tag !== triggerConfig.tag_name) return false;
    }

    // Deal stage triggers
    if (triggerConfig.stage_id !== undefined) {
      const eventStage = eventData.newStageId ?? eventData.newStage;
      if (eventStage === undefined || String(triggerConfig.stage_id) !== String(eventStage)) return false;
    }

    if (triggerConfig.pipeline_id !== undefined) {
      const eventPipeline = eventData.pipeline_id ?? eventData.deal?.pipeline_id;
      if (eventPipeline === undefined || String(triggerConfig.pipeline_id) !== String(eventPipeline)) return false;
    }

    // Contact source triggers
    if (triggerConfig.source) {
      if (!eventData.source || triggerConfig.source !== eventData.source) return false;
    }

    if (triggerConfig.form_id !== undefined) {
      const eventForm = eventData.form?.id ?? eventData.form_id;
      if (eventForm === undefined || String(triggerConfig.form_id) !== String(eventForm)) return false;
    }

    return true;
  }

  /**
   * Enroll a contact in a workflow
   */
  async enrollContact(client, workflowId, contactId, triggerData = {}) {
    try {
      // Check if already enrolled
      const existing = await client.query(
        `SELECT ${workflowEnrollmentColumns()} FROM workflow_enrollments WHERE workflow_id = $1 AND contact_id = $2`,
        [workflowId, contactId]
      );

      if (existing.rows.length > 0) {
        const enrollment = existing.rows[0];
        if (enrollment.status === 'active') {
          console.log(`AutomationEngine: Contact ${contactId} already enrolled in workflow ${workflowId}`);
          return null;
        }

        // Re-enroll completed/failed enrollments
        const result = await client.query(
          `UPDATE workflow_enrollments 
           SET status = 'active', current_step = 1, enrolled_at = CURRENT_TIMESTAMP,
               trigger_data = $1, context = '{}', error_message = NULL, completed_at = NULL,
               next_action_at = CURRENT_TIMESTAMP, execution_attempt_count = 0,
               execution_claim_token = NULL, execution_lease_expires_at = NULL,
               pause_reason = NULL, paused_at = NULL
           WHERE id = $2
           RETURNING ${workflowEnrollmentColumns()}`,
          [JSON.stringify(triggerData), enrollment.id]
        );
        return result.rows[0];
      }

      // Create new enrollment
      const result = await client.query(
        `INSERT INTO workflow_enrollments 
          (workflow_id, contact_id, trigger_data, status, current_step, next_action_at)
        VALUES ($1, $2, $3, 'active', 1, CURRENT_TIMESTAMP)
        RETURNING ${workflowEnrollmentColumns()}`,
        [workflowId, contactId, JSON.stringify(triggerData)]
      );

      // Update workflow stats
      await client.query(
        `UPDATE workflows 
         SET stats = jsonb_set(stats, '{enrolled}', ((stats->>'enrolled')::int + 1)::text::jsonb)
         WHERE id = $1`,
        [workflowId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('AutomationEngine: Error enrolling contact:', error);
      return null;
    }
  }

  /**
   * Process the next step for an enrollment
   */
  async processEnrollment(client, enrollmentId, claim = null) {
    const startTime = Date.now();
    const activeClaim = claim || await claimWorkflowEnrollment(client, { enrollmentId });
    if (!activeClaim) {
      return {
        success: false,
        claimed: true,
        error: 'Enrollment is already claimed or is not due',
      };
    }
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      // Get enrollment with contact and workflow data
      const enrollmentResult = await client.query(
        `SELECT 
          ${workflowEnrollmentColumns('we')},
          c.first_name, c.last_name, c.email, c.phone, c.company, c.job_title,
          c.custom_fields as contact_custom_fields, c.tags as contact_tags,
          w.name as workflow_name, w.organization_id
        FROM workflow_enrollments we
        JOIN contacts c ON we.contact_id = c.id
        JOIN workflows w ON we.workflow_id = w.id
        WHERE we.id = $1
          AND we.status = 'active'
          AND we.execution_attempt_count = $2
          AND we.execution_claim_token = $3::uuid
        FOR UPDATE OF we`,
        [
          enrollmentId,
          activeClaim.execution_attempt_count,
          activeClaim.execution_claim_token,
        ]
      );

      if (enrollmentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          claimed: true,
          stale: true,
          error: 'Enrollment claim is no longer authoritative',
        };
      }

      const enrollment = enrollmentResult.rows[0];

      // Get current step
      const stepResult = await client.query(
        `SELECT ${workflowStepColumns()} FROM workflow_steps
         WHERE workflow_id = $1 AND step_order = $2`,
        [enrollment.workflow_id, enrollment.current_step]
      );

      if (stepResult.rows.length === 0) {
        // No more steps - workflow complete
        await this.completeEnrollment(client, enrollmentId, 'completed', activeClaim);
        await client.query('COMMIT');
        transactionOpen = false;
        return { success: true, completed: true };
      }

      const step = stepResult.rows[0];

      // Log step start
      await this.logStepExecution(client, enrollmentId, step, 'started', {}, {});

      // Execute the step
      const result = await this.executeStep(client, enrollment, step);

      // Log step completion
      const duration = Date.now() - startTime;
      await this.logStepExecution(
        client, 
        enrollmentId, 
        step, 
        result.success ? 'completed' : 'failed',
        workflowStepLogInput(step),
        result,
        result.error,
        duration
      );

      if (!result.success) {
        await this.failEnrollment(client, enrollmentId, result.error, activeClaim);
        await client.query('COMMIT');
        transactionOpen = false;
        return result;
      }

      // Handle branching for condition steps
      let nextStep = enrollment.current_step + 1;
      if (step.step_type === 'condition') {
        nextStep = result.branchResult ? step.true_branch_step : step.false_branch_step;
        if (!nextStep) {
          nextStep = enrollment.current_step + 1;
        }
      }

      // Check if there's a next step
      const nextStepCheck = await client.query(
        `SELECT ${workflowStepColumns()} FROM workflow_steps WHERE workflow_id = $1 AND step_order = $2`,
        [enrollment.workflow_id, nextStep]
      );

      if (nextStepCheck.rows.length === 0) {
        // Workflow complete
        await this.completeEnrollment(client, enrollmentId, 'completed', activeClaim);
        await client.query('COMMIT');
        transactionOpen = false;
        return { success: true, completed: true };
      }

      // Update enrollment to next step
      const nextActionAt = result.waitUntil || new Date();
      const progress = await client.query(
        `UPDATE workflow_enrollments 
         SET current_step = $1,
             next_action_at = $2,
             context = $3,
             execution_claim_token = CASE WHEN $4::boolean THEN NULL ELSE execution_claim_token END,
             execution_lease_expires_at = CASE
               WHEN $4::boolean THEN NULL
               ELSE CURRENT_TIMESTAMP + ($5::integer * INTERVAL '1 second')
             END
         WHERE id = $6
           AND status = 'active'
           AND execution_attempt_count = $7
           AND execution_claim_token = $8::uuid
         RETURNING id`,
        [
          nextStep,
          nextActionAt,
          JSON.stringify(result.context || enrollment.context),
          Boolean(result.waitUntil),
          activeClaim.lease_seconds,
          enrollmentId,
          activeClaim.execution_attempt_count,
          activeClaim.execution_claim_token,
        ]
      );
      if (progress.rows.length === 0) {
        throw new Error('Enrollment claim expired before progress could be recorded');
      }
      await client.query('COMMIT');
      transactionOpen = false;

      // If no wait, process next step immediately
      if (!result.waitUntil) {
        return this.processEnrollment(client, enrollmentId, activeClaim);
      }

      return { success: true, waiting: true, nextActionAt };
    } catch (error) {
      console.error('AutomationEngine: Error processing enrollment:', error);
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('AutomationEngine: Error rolling back enrollment step:', rollbackError);
        }
        transactionOpen = false;
      }
      try {
        await client.query('BEGIN');
        transactionOpen = true;
        await this.failEnrollment(client, enrollmentId, error.message, activeClaim);
        await client.query('COMMIT');
        transactionOpen = false;
      } catch (failureError) {
        if (transactionOpen) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            console.error('AutomationEngine: Error rolling back enrollment failure:', rollbackError);
          }
        }
        console.error('AutomationEngine: Error marking enrollment failed:', failureError);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a single workflow step
   */
  async executeStep(client, enrollment, step) {
    const contact = {
      id: enrollment.contact_id,
      first_name: enrollment.first_name,
      last_name: enrollment.last_name,
      email: enrollment.email,
      phone: enrollment.phone,
      company: enrollment.company,
      job_title: enrollment.job_title,
      custom_fields: enrollment.contact_custom_fields,
      tags: enrollment.contact_tags,
    };

    const config = step.step_config || {};

    switch (step.step_type) {
      case 'send_email':
        return this.executeSendEmail(client, enrollment, contact, config, step);

      case 'add_tag':
        return this.executeAddTag(client, enrollment, contact, config);

      case 'remove_tag':
        return this.executeRemoveTag(client, enrollment, contact, config);

      case 'wait':
        return this.executeWait(config);

      case 'create_task':
        return this.executeCreateTask(client, enrollment, contact, config);

      case 'update_contact':
        return this.executeUpdateContact(client, enrollment, contact, config);

      case 'condition':
        return this.executeCondition(enrollment, contact, config, step.condition_config);

      case 'webhook':
        return this.executeWebhook(client, enrollment, contact, config, step);

      case 'move_deal':
        return this.executeMoveDeal(client, enrollment, config);

      case 'send_sms':
        return this.executeSendSms(client, enrollment, contact, config, step);

      default:
        return { success: false, error: `Unknown step type: ${step.step_type}` };
    }
  }

  /**
   * Execute send email step
   */
  async executeSendEmail(client, enrollment, contact, config, step) {
    if (!contact.email) {
      return { success: false, error: 'Contact has no email address' };
    }

    if (!config.template_id) {
      return { success: false, error: 'No template_id specified' };
    }

    try {
      // Get email template
      const templateResult = await client.query(
        `SELECT ${emailTemplateColumns()} FROM email_templates WHERE id = $1 AND organization_id = $2`,
        [config.template_id, enrollment.organization_id]
      );

      if (templateResult.rows.length === 0) {
        return { success: false, error: 'Email template not found' };
      }

      const template = templateResult.rows[0];
      const content = emailService.prepareEmailContent(
        template,
        contact,
        enrollment.context || {}
      );
      const outbox = await enqueueWorkflowSideEffect(client, {
        effectType: 'email',
        enrollment,
        step,
        payload: {
          bodyHtml: content.html,
          bodyText: content.text,
          contactId: contact.id,
          subject: content.subject,
          templateId: template.id,
          to: contact.email,
        },
      });

      return {
        success: true,
        queued: true,
        outboxId: outbox.id,
        idempotencyKey: outbox.idempotency_key,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute send SMS step
   */
  async executeSendSms(client, enrollment, contact, config, step) {
    if (!contact.phone) {
      return { success: false, error: 'Contact has no phone number' };
    }

    // Either template_id or message is required
    if (!config.template_id && !config.message) {
      return { success: false, error: 'No template_id or message specified' };
    }

    try {
      let message;
      let templateId = null;

      // If using template, fetch and process it
      if (config.template_id) {
        const templateResult = await client.query(
          `SELECT ${smsTemplateColumns()} FROM sms_templates WHERE id = $1 AND organization_id = $2`,
          [config.template_id, enrollment.organization_id]
        );

        if (templateResult.rows.length === 0) {
          return { success: false, error: 'SMS template not found' };
        }

        const template = templateResult.rows[0];
        templateId = template.id;
        message = smsService.replaceVariables(template.message, contact);
      } else {
        // Use direct message from config
        message = smsService.replaceVariables(config.message, contact);
      }

      // Get message info for logging
      const messageInfo = smsService.getMessageInfo(message);
      const normalizedRecipient = smsService.normalizePhoneNumber(contact.phone);
      if (!smsService.isValidPhoneNumber(normalizedRecipient)) {
        return { success: false, error: 'Contact phone number is invalid' };
      }

      const senderResult = await client.query(`
        SELECT phone_number
        FROM sms_receiving_numbers
        WHERE organization_id = $1
          AND provider = 'twilio'
          AND is_active = TRUE
        ORDER BY is_primary DESC, id
        LIMIT 1
      `, [enrollment.organization_id]);
      if (senderResult.rows.length === 0) {
        return { success: false, error: 'No active organization SMS number is configured' };
      }
      const outbox = await enqueueWorkflowSideEffect(client, {
        effectType: 'sms',
        enrollment,
        step,
        payload: {
          contactId: contact.id,
          from: senderResult.rows[0].phone_number,
          message,
          segments: messageInfo.segments,
          templateId,
          to: normalizedRecipient,
        },
      });

      return {
        success: true,
        queued: true,
        outboxId: outbox.id,
        idempotencyKey: outbox.idempotency_key,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute add tag step
   */
  async executeAddTag(client, enrollment, contact, config) {
    if (!config.tag_name) {
      return { success: false, error: 'No tag_name specified' };
    }

    try {
      const currentTags = contact.tags || [];
      if (!currentTags.includes(config.tag_name)) {
        await client.query(
          `UPDATE contacts
           SET tags = array_append(tags, $1), updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3`,
          [config.tag_name, contact.id, enrollment.organization_id]
        );
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute remove tag step
   */
  async executeRemoveTag(client, enrollment, contact, config) {
    if (!config.tag_name) {
      return { success: false, error: 'No tag_name specified' };
    }

    try {
      await client.query(
        `UPDATE contacts
         SET tags = array_remove(tags, $1), updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3`,
        [config.tag_name, contact.id, enrollment.organization_id]
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute wait step
   */
  executeWait(config) {
    const waitMinutes = Number(config.delay_minutes ?? config.wait_minutes ?? 0);
    const waitHours = Number(config.delay_hours ?? config.wait_hours ?? 0);
    const waitDays = Number(config.delay_days ?? config.wait_days ?? 0);

    if (![waitMinutes, waitHours, waitDays].every(Number.isFinite)
      || waitMinutes < 0 || waitHours < 0 || waitDays < 0) {
      return { success: false, error: 'Wait duration must contain non-negative finite numbers' };
    }

    const totalMinutes = waitMinutes + (waitHours * 60) + (waitDays * 24 * 60);
    
    if (totalMinutes <= 0) {
      return { success: true };
    }

    const waitUntil = new Date(Date.now() + totalMinutes * 60 * 1000);
    return { success: true, waitUntil };
  }

  /**
   * Execute create task step
   */
  async executeCreateTask(client, enrollment, contact, config) {
    try {
      const dueDate = config.due_days 
        ? new Date(Date.now() + config.due_days * 24 * 60 * 60 * 1000)
        : null;

      const result = await client.query(
        `INSERT INTO tasks 
          (organization_id, contact_id, title, description, due_date, priority, status, assigned_to)
        SELECT $1, $2, $3, $4, $5, $6, 'pending', $7
        WHERE $7::integer IS NULL OR EXISTS (
          SELECT 1 FROM organization_members
          WHERE organization_id = $1 AND user_id = $7
        )
        RETURNING id`,
        [
          enrollment.organization_id,
          contact.id,
          emailService.replaceVariables(config.title || 'Follow up', contact),
          emailService.replaceVariables(config.description || '', contact),
          dueDate,
          config.priority || 'medium',
          config.assigned_to || null,
        ]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Assigned user is not a member of the workflow organization' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute update contact step
   */
  async executeUpdateContact(client, enrollment, contact, config) {
    try {
      const updates = [];
      const params = [contact.id];
      let paramIndex = 2;

      if (config.status) {
        updates.push(`status = $${paramIndex}`);
        params.push(config.status);
        paramIndex++;
      }

      if (config.custom_fields) {
        updates.push(`custom_fields = custom_fields || $${paramIndex}`);
        params.push(JSON.stringify(config.custom_fields));
        paramIndex++;
      }

      if (updates.length === 0) {
        return { success: true };
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');

      await client.query(
        `UPDATE contacts SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $${paramIndex}`,
        [...params, enrollment.organization_id]
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute condition step
   */
  executeCondition(enrollment, contact, config, conditionConfig) {
    if (!conditionConfig) {
      return { success: true, branchResult: true };
    }

    const { field, operator, value } = conditionConfig;
    
    // Get field value from contact
    let fieldValue = contact[field] ?? contact.custom_fields?.[field];

    // Handle array fields like tags
    if (field === 'tags') {
      fieldValue = contact.tags || [];
    }

    let result = false;

    switch (operator) {
      case 'equals':
        result = fieldValue === value;
        break;
      case 'not_equals':
        result = fieldValue !== value;
        break;
      case 'contains':
        if (fieldValue === undefined || fieldValue === null) break;
        if (Array.isArray(fieldValue)) {
          result = fieldValue.includes(value);
        } else {
          result = String(fieldValue).includes(value);
        }
        break;
      case 'not_contains':
        if (fieldValue === undefined || fieldValue === null) {
          result = true;
          break;
        }
        if (Array.isArray(fieldValue)) {
          result = !fieldValue.includes(value);
        } else {
          result = !String(fieldValue).includes(value);
        }
        break;
      case 'is_empty':
        result = !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
        break;
      case 'is_not_empty':
        result = !!fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0);
        break;
      case 'greater_than':
        result = Number(fieldValue) > Number(value);
        break;
      case 'less_than':
        result = Number(fieldValue) < Number(value);
        break;
      default:
        return { success: false, error: `Unsupported condition operator: ${operator}` };
    }

    return { success: true, branchResult: result };
  }

  /**
   * Execute webhook step
   */
  async executeWebhook(client, enrollment, contact, config, step) {
    if (!config.url) {
      return { success: false, error: 'No webhook URL specified' };
    }

    try {
      const targetUrl = parseWorkflowWebhookUrl(config.url);
      const method = String(config.method || 'POST').toUpperCase();
      if (!WORKFLOW_WEBHOOK_METHODS.has(method)) {
        return { success: false, error: 'Unsupported workflow webhook method' };
      }
      const payload = {
        ...(config.custom_payload || {}),
        event: 'workflow_step',
        workflow_id: enrollment.workflow_id,
        contact: {
          id: contact.id,
          email: contact.email,
          first_name: contact.first_name,
          last_name: contact.last_name,
          company: contact.company,
        },
        enrollment_id: enrollment.id,
        timestamp: new Date().toISOString(),
      };
      if (Buffer.byteLength(JSON.stringify(payload)) > DEFAULT_WEBHOOK_MAX_REQUEST_BYTES) {
        return { success: false, error: 'Workflow webhook request exceeded the byte limit' };
      }
      const outbox = await enqueueWorkflowSideEffect(client, {
        effectType: 'webhook',
        enrollment,
        step,
        payload: {
          body: payload,
          headers: normalizeWorkflowWebhookHeaders(config.headers),
          method,
          url: targetUrl.toString(),
        },
      });

      return {
        success: true,
        queued: true,
        outboxId: outbox.id,
        idempotencyKey: outbox.idempotency_key,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute move deal stage step
   */
  async executeMoveDeal(client, enrollment, config) {
    if (!config.stage_id) {
      return { success: false, error: 'stage_id required' };
    }

    try {
      // If no deal_id specified, find deals for the contact
      let dealId = config.deal_id;
      
      if (!dealId) {
        const deals = await client.query(
          `SELECT id FROM deals 
           WHERE contact_id = $1 AND organization_id = $2 
           AND won_at IS NULL AND lost_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [enrollment.contact_id, enrollment.organization_id]
        );
        
        if (deals.rows.length === 0) {
          return { success: true }; // No deal to move, not an error
        }
        dealId = deals.rows[0].id;
      }

      const result = await client.query(
        `UPDATE deals
         SET stage_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3
         RETURNING id`,
        [config.stage_id, dealId, enrollment.organization_id]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Deal not found in workflow organization' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Log step execution
   */
  async logStepExecution(client, enrollmentId, step, status, inputData, outputData, errorMessage = null, durationMs = null) {
    try {
      await client.query(
        `INSERT INTO workflow_execution_logs 
          (enrollment_id, step_id, step_order, action_type, status, input_data, output_data, error_message, duration_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          enrollmentId,
          step.id,
          step.step_order,
          step.step_type,
          status,
          JSON.stringify(inputData),
          JSON.stringify(outputData),
          errorMessage,
          durationMs,
        ]
      );
    } catch (error) {
      console.error('AutomationEngine: Error logging step execution:', error);
    }
  }

  /**
   * Complete an enrollment
   */
  async completeEnrollment(client, enrollmentId, status = 'completed', claim) {
    const enrollment = await client.query(
      `UPDATE workflow_enrollments
       SET status = $1,
           completed_at = CURRENT_TIMESTAMP,
           next_action_at = NULL,
           execution_claim_token = NULL,
           execution_lease_expires_at = NULL
       WHERE id = $2
         AND status = 'active'
         AND execution_attempt_count = $3
         AND execution_claim_token = $4::uuid
       RETURNING workflow_id`,
      [
        status,
        enrollmentId,
        claim.execution_attempt_count,
        claim.execution_claim_token,
      ]
    );

    if (enrollment.rows.length > 0) {
      await client.query(
        `UPDATE workflows 
         SET stats = jsonb_set(stats, '{completed}', ((stats->>'completed')::int + 1)::text::jsonb)
         WHERE id = $1`,
        [enrollment.rows[0].workflow_id]
      );
    }
    return enrollment.rows.length > 0;
  }

  /**
   * Fail an enrollment
   */
  async failEnrollment(client, enrollmentId, errorMessage, claim) {
    const enrollment = await client.query(
      `UPDATE workflow_enrollments
       SET status = 'failed',
           error_message = $1,
           completed_at = CURRENT_TIMESTAMP,
           next_action_at = NULL,
           execution_claim_token = NULL,
           execution_lease_expires_at = NULL
       WHERE id = $2
         AND status = 'active'
         AND execution_attempt_count = $3
         AND execution_claim_token = $4::uuid
       RETURNING workflow_id`,
      [
        errorMessage,
        enrollmentId,
        claim.execution_attempt_count,
        claim.execution_claim_token,
      ]
    );

    if (enrollment.rows.length > 0) {
      await client.query(
        `UPDATE workflows 
         SET stats = jsonb_set(stats, '{failed}', ((stats->>'failed')::int + 1)::text::jsonb)
         WHERE id = $1`,
        [enrollment.rows[0].workflow_id]
      );
    }
    return enrollment.rows.length > 0;
  }

  /**
   * Process pending enrollments (for scheduled processing)
   */
  async processPendingEnrollments() {
    let client;
    try {
      client = await this.pool.connect();

      const pending = await client.query(
        `SELECT id FROM workflow_enrollments 
         WHERE status = 'active' 
         AND next_action_at <= CURRENT_TIMESTAMP
         ORDER BY next_action_at
         LIMIT 100`
      );

      for (const enrollment of pending.rows) {
        await this.processEnrollment(client, enrollment.id);
      }

      return { processed: pending.rows.length };
    } catch (error) {
      console.error('AutomationEngine: Error processing pending enrollments:', error);
      return { processed: 0, error: error.message };
    } finally {
      client?.release();
    }
  }
}

// Factory function to create engine instance
let engineInstance = null;

const createAutomationEngine = (pool) => {
  if (!engineInstance) {
    engineInstance = new AutomationEngine(pool);
  }
  return engineInstance;
};

const getAutomationEngine = () => {
  if (!engineInstance) {
    throw new Error('AutomationEngine not initialized. Call createAutomationEngine first.');
  }
  return engineInstance;
};

module.exports = {
  AutomationEngine,
  createAutomationEngine,
  enqueueWorkflowSideEffect,
  getAutomationEngine,
  normalizeWorkflowWebhookHeaders,
  parseWorkflowWebhookUrl,
  claimWorkflowEnrollment,
  workflowSideEffectKey,
  workflowStepLogInput,
};
