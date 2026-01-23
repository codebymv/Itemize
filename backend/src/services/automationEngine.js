/**
 * Automation Engine - Core workflow execution engine
 * Handles triggers, enrollments, and step execution
 */

const emailService = require('./emailService');
const smsService = require('./smsService');

class AutomationEngine {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Handle an incoming trigger event
   * Finds matching workflows and enrolls contacts
   */
  async handleTrigger(triggerType, data) {
    const { contact, organizationId, ...triggerData } = data;

    if (!contact || !organizationId) {
      console.log('AutomationEngine: Missing contact or organizationId in trigger data');
      return { enrolled: 0 };
    }

    try {
      const client = await this.pool.connect();

      // Find active workflows matching this trigger type
      const workflows = await client.query(
        `SELECT * FROM workflows 
         WHERE organization_id = $1 
         AND trigger_type = $2 
         AND is_active = true`,
        [organizationId, triggerType]
      );

      let enrolledCount = 0;

      for (const workflow of workflows.rows) {
        // Check if trigger conditions match
        const shouldEnroll = this.checkTriggerConditions(workflow.trigger_config, triggerData);
        
        if (shouldEnroll) {
          const enrolled = await this.enrollContact(client, workflow.id, contact.id, {
            trigger_type: triggerType,
            ...triggerData,
          });
          
          if (enrolled) {
            enrolledCount++;
            // Process first step immediately
            await this.processEnrollment(client, enrolled.id);
          }
        }
      }

      client.release();
      
      console.log(`AutomationEngine: Trigger ${triggerType} - Enrolled ${enrolledCount} workflows`);
      return { enrolled: enrolledCount };
    } catch (error) {
      console.error('AutomationEngine: Error handling trigger:', error);
      return { enrolled: 0, error: error.message };
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
    if (triggerConfig.tag_name && eventData.tag) {
      return eventData.tag === triggerConfig.tag_name;
    }

    // Deal stage triggers
    if (triggerConfig.stage_id && eventData.newStage) {
      if (triggerConfig.stage_id !== eventData.newStage) {
        return false;
      }
    }

    if (triggerConfig.pipeline_id && eventData.pipeline_id) {
      if (triggerConfig.pipeline_id !== eventData.pipeline_id) {
        return false;
      }
    }

    // Contact source triggers
    if (triggerConfig.source && eventData.source) {
      if (triggerConfig.source !== eventData.source) {
        return false;
      }
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
        'SELECT * FROM workflow_enrollments WHERE workflow_id = $1 AND contact_id = $2',
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
               next_action_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [JSON.stringify(triggerData), enrollment.id]
        );
        return result.rows[0];
      }

      // Create new enrollment
      const result = await client.query(
        `INSERT INTO workflow_enrollments 
          (workflow_id, contact_id, trigger_data, status, current_step, next_action_at)
        VALUES ($1, $2, $3, 'active', 1, CURRENT_TIMESTAMP)
        RETURNING *`,
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
  async processEnrollment(client, enrollmentId) {
    const startTime = Date.now();

    try {
      // Get enrollment with contact and workflow data
      const enrollmentResult = await client.query(
        `SELECT 
          we.*,
          c.first_name, c.last_name, c.email, c.phone, c.company, c.job_title,
          c.custom_fields as contact_custom_fields, c.tags as contact_tags,
          w.name as workflow_name, w.organization_id
        FROM workflow_enrollments we
        JOIN contacts c ON we.contact_id = c.id
        JOIN workflows w ON we.workflow_id = w.id
        WHERE we.id = $1 AND we.status = 'active'`,
        [enrollmentId]
      );

      if (enrollmentResult.rows.length === 0) {
        return { success: false, error: 'Enrollment not found or not active' };
      }

      const enrollment = enrollmentResult.rows[0];

      // Get current step
      const stepResult = await client.query(
        `SELECT * FROM workflow_steps 
         WHERE workflow_id = $1 AND step_order = $2`,
        [enrollment.workflow_id, enrollment.current_step]
      );

      if (stepResult.rows.length === 0) {
        // No more steps - workflow complete
        await this.completeEnrollment(client, enrollmentId, 'completed');
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
        { step_config: step.step_config },
        result,
        result.error,
        duration
      );

      if (!result.success) {
        await this.failEnrollment(client, enrollmentId, result.error);
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
        'SELECT * FROM workflow_steps WHERE workflow_id = $1 AND step_order = $2',
        [enrollment.workflow_id, nextStep]
      );

      if (nextStepCheck.rows.length === 0) {
        // Workflow complete
        await this.completeEnrollment(client, enrollmentId, 'completed');
        return { success: true, completed: true };
      }

      // Update enrollment to next step
      const nextActionAt = result.waitUntil || new Date();
      await client.query(
        `UPDATE workflow_enrollments 
         SET current_step = $1, next_action_at = $2, context = $3
         WHERE id = $4`,
        [nextStep, nextActionAt, JSON.stringify(result.context || enrollment.context), enrollmentId]
      );

      // If no wait, process next step immediately
      if (!result.waitUntil) {
        return this.processEnrollment(client, enrollmentId);
      }

      return { success: true, waiting: true, nextActionAt };
    } catch (error) {
      console.error('AutomationEngine: Error processing enrollment:', error);
      await this.failEnrollment(client, enrollmentId, error.message);
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
        return this.executeSendEmail(client, enrollment, contact, config);

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
        return this.executeWebhook(enrollment, contact, config);

      case 'move_deal':
        return this.executeMoveDeal(client, enrollment, config);

      case 'send_sms':
        return this.executeSendSms(client, enrollment, contact, config);

      default:
        return { success: false, error: `Unknown step type: ${step.step_type}` };
    }
  }

  /**
   * Execute send email step
   */
  async executeSendEmail(client, enrollment, contact, config) {
    if (!contact.email) {
      return { success: false, error: 'Contact has no email address' };
    }

    if (!config.template_id) {
      return { success: false, error: 'No template_id specified' };
    }

    try {
      // Get email template
      const templateResult = await client.query(
        'SELECT * FROM email_templates WHERE id = $1 AND organization_id = $2',
        [config.template_id, enrollment.organization_id]
      );

      if (templateResult.rows.length === 0) {
        return { success: false, error: 'Email template not found' };
      }

      const template = templateResult.rows[0];

      // Send email
      const sendResult = await emailService.sendTemplateEmail({
        template,
        contact,
        additionalData: enrollment.context || {},
      });

      // Log email
      await client.query(
        `INSERT INTO email_logs 
          (organization_id, contact_id, template_id, workflow_enrollment_id, to_email, subject, body_html, status, external_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          enrollment.organization_id,
          contact.id,
          template.id,
          enrollment.id,
          contact.email,
          emailService.replaceVariables(template.subject, contact),
          emailService.replaceVariables(template.body_html, contact),
          sendResult.success ? 'sent' : 'failed',
          sendResult.id || null,
        ]
      );

      return { 
        success: sendResult.success || sendResult.simulated, 
        error: sendResult.error,
        emailId: sendResult.id,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute send SMS step
   */
  async executeSendSms(client, enrollment, contact, config) {
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
          'SELECT * FROM sms_templates WHERE id = $1 AND organization_id = $2',
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

      // Send SMS
      const sendResult = await smsService.sendSms({
        to: contact.phone,
        message,
      });

      // Log SMS to database
      await client.query(
        `INSERT INTO sms_logs 
          (organization_id, contact_id, template_id, workflow_enrollment_id, to_phone, from_phone, message, direction, status, external_id, segments)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'outbound', $8, $9, $10)`,
        [
          enrollment.organization_id,
          contact.id,
          templateId,
          enrollment.id,
          smsService.normalizePhoneNumber(contact.phone),
          process.env.TWILIO_PHONE_NUMBER || null,
          message,
          sendResult.success ? 'sent' : 'failed',
          sendResult.id || null,
          messageInfo.segments,
        ]
      );

      return { 
        success: sendResult.success || sendResult.simulated, 
        error: sendResult.error,
        smsId: sendResult.id,
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
          'UPDATE contacts SET tags = array_append(tags, $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [config.tag_name, contact.id]
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
        'UPDATE contacts SET tags = array_remove(tags, $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [config.tag_name, contact.id]
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
    const waitMinutes = config.delay_minutes || config.wait_minutes || 0;
    const waitHours = config.delay_hours || config.wait_hours || 0;
    const waitDays = config.delay_days || config.wait_days || 0;

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

      await client.query(
        `INSERT INTO tasks 
          (organization_id, contact_id, title, description, due_date, priority, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
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
        `UPDATE contacts SET ${updates.join(', ')} WHERE id = $1`,
        params
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
    let fieldValue = contact[field] || contact.custom_fields?.[field];

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
        if (Array.isArray(fieldValue)) {
          result = fieldValue.includes(value);
        } else {
          result = String(fieldValue).includes(value);
        }
        break;
      case 'not_contains':
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
        result = true;
    }

    return { success: true, branchResult: result };
  }

  /**
   * Execute webhook step
   */
  async executeWebhook(enrollment, contact, config) {
    if (!config.url) {
      return { success: false, error: 'No webhook URL specified' };
    }

    try {
      const payload = {
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
        ...config.custom_payload,
      };

      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return { success: false, error: `Webhook failed with status ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute move deal stage step
   */
  async executeMoveDeal(client, enrollment, config) {
    if (!config.deal_id && !config.stage_id) {
      return { success: false, error: 'deal_id and stage_id required' };
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

      await client.query(
        'UPDATE deals SET stage_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [config.stage_id, dealId]
      );

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
  async completeEnrollment(client, enrollmentId, status = 'completed') {
    await client.query(
      `UPDATE workflow_enrollments 
       SET status = $1, completed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [status, enrollmentId]
    );

    // Update workflow stats
    const enrollment = await client.query(
      'SELECT workflow_id FROM workflow_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollment.rows.length > 0) {
      await client.query(
        `UPDATE workflows 
         SET stats = jsonb_set(stats, '{completed}', ((stats->>'completed')::int + 1)::text::jsonb)
         WHERE id = $1`,
        [enrollment.rows[0].workflow_id]
      );
    }
  }

  /**
   * Fail an enrollment
   */
  async failEnrollment(client, enrollmentId, errorMessage) {
    await client.query(
      `UPDATE workflow_enrollments 
       SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [errorMessage, enrollmentId]
    );

    // Update workflow stats
    const enrollment = await client.query(
      'SELECT workflow_id FROM workflow_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollment.rows.length > 0) {
      await client.query(
        `UPDATE workflows 
         SET stats = jsonb_set(stats, '{failed}', ((stats->>'failed')::int + 1)::text::jsonb)
         WHERE id = $1`,
        [enrollment.rows[0].workflow_id]
      );
    }
  }

  /**
   * Process pending enrollments (for scheduled processing)
   */
  async processPendingEnrollments() {
    try {
      const client = await this.pool.connect();

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

      client.release();
      return { processed: pending.rows.length };
    } catch (error) {
      console.error('AutomationEngine: Error processing pending enrollments:', error);
      return { processed: 0, error: error.message };
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
  getAutomationEngine,
};
