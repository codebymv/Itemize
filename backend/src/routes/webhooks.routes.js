const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { validate, webhookEvent } = require('../validators/schemas');

/**
 * POST /api/webhooks/:workflowId
 * Process workflow trigger events
 */
router.post('/:workflowId', validate(webhookEvent), async (req, res) => {
  const { workflowId } = req.params;
  const { eventType, entityData = {} } = req.body;
  const data = entityData || {};

  try {
    const pool = req.dbPool;
    
    if (!pool) {
      return res.status(503).json({ error: 'Database connection not available' });
    }

    // Validate workflow exists and is active
    const workflowQuery = `
      SELECT id, name, is_active, actions
      FROM workflows
      WHERE id = $1
    `;
    const workflowRes = await pool.query(workflowQuery, [workflowId]);
    
    if (workflowRes.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const workflow = workflowRes.rows[0];
    if (!workflow.is_active) {
      return res.status(200).json({ 
        success: false, 
        message: 'Workflow is not active',
        workflowId,
      });
    }

    logger.info('Workflow trigger received', { workflowId, eventType, data });

    // Create trigger record (if table exists)
    let triggerId = null;
    try {
      const triggerQuery = `
        INSERT INTO workflow_triggers (workflow_id, trigger_type, entity_id, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING id
      `;
      const triggerRes = await pool.query(triggerQuery, [
        workflowId, eventType, data.entityId,
      ]);
      triggerId = triggerRes.rows[0]?.id;
    } catch (err) {
      logger.warn('Failed to create trigger record', { error: err.message });
    }

    // Process actions
    const errors = [];
    const successes = [];

    try {
      const actions = workflow.actions;
      
      if (!actions || !Array.isArray(actions)) {
        logger.warn('No actions defined for workflow', { workflowId });
        return res.status(200).json({ 
          success: true, 
          message: 'Workflow triggered but has no actions',
          workflowId,
          triggerId,
        });
      }

      for (const action of actions) {
        try {
          logger.info('Executing workflow action', { actionType: action.type, workflowId });
          
          switch (action.type) {
            case 'send_invoice':
              await executeSendInvoice(action, data);
              successes.push(`send_invoice: ${action.invoiceAmount || 'auto'} for ${data.contactName || 'contact'}`);
              break;
            
            case 'update_deal':
              await executeUpdateDeal(action, data);
              successes.push(`update_deal: to ${action.status || 'Won'}`);
              break;
            
            case 'send_email':
              await executeSendEmail(action, data);
              successes.push(`send_email: to ${data.email || 'contact'}`);
              break;
            
            case 'update_contact_status':
              await executeUpdateContactStatus(action, data);
              successes.push(`update_contact_status: to ${action.status || 'customer'}`);
              break;
            
            case 'send_review_request':
              await executeSendReviewRequest(action, data);
              successes.push(`send_review_request: for deal ${data.dealId || 'unknown'}`);
              break;
            
            case 'create_task':
              await executeCreateTask(action, data);
              successes.push(`create_task: ${action.taskTitle || 'New task'}`);
              break;
            
            default:
              throw new Error(`Unknown action type: ${action.type}`);
          }
        } catch (actionError) {
          logger.error('Action execution failed', { 
            action, 
            error: actionError.message, 
            stack: actionError.stack 
          });
          errors.push(`${action.type}: ${actionError.message}`);
        }
      }

      // Update trigger status
      if (triggerId) {
        const status = errors.length > 0 ? 'failed' : 'completed';
        const errorMessage = errors.length > 0 ? errors[0] : null;
        await pool.query(
          'UPDATE workflow_triggers SET status = $1, error_message = $2, processed_at = CURRENT_TIMESTAMP WHERE id = $3',
          [status, errorMessage, triggerId]
        );
      }

      const result = {
        success: errors.length === 0,
        triggerId,
        successes,
        errors,
        message: `Processed ${successes.length} actions, ${errors.length} failed`,
      };

      if (errors.length > 0) {
        logger.warn('Workflow completed with errors', result);
        return res.status(207).json(result);
      }

      return res.status(200).json(result);
    } catch (actionError) {
      logger.error('Workflow actions error', { error: actionError.message });
      
      // Update trigger with error
      if (triggerId) {
        await pool.query(
          'UPDATE workflow_triggers SET status = $1, error_message = $2, processed_at = CURRENT_TIMESTAMP WHERE id = $3',
          ['failed', actionError.message || 'Action execution error', triggerId]
        );
      }

      return res.status(500).json({ 
        success: false,
        message: 'Failed to execute workflow actions',
      });
    }
  } catch (error) {
    logger.error('Webhook processing error', { error: error.message, stack: error.stack });
    res.status(500).json({ 
      success: false,
      message: 'Processing failed',
      error: error.message,
    });
  }
});

// Action implementations
async function executeSendInvoice(action, data) {
  // contract → auto-create invoice
  // data contains: contractId, amount, etc.
  const { contractId, amount, contactId, email } = data;
  
  logger.info('Executing send_invoice action', { contractId, amount });
  
  // Create invoice from contract
  const invoiceQuery = `
    INSERT INTO invoices (contact_id, total, amount, due_date, created_at)
    VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_TIMESTAMP)
    RETURNING id, invoice_number
  `;
  // This would need the invoices table to have proper columns
  // Execute when ready
}

async function executeUpdateDeal(action, data) {
  // Auto-update deal to "Won" when invoice paid
  const { dealId, status = 'Won', stage = 'Won', contactId } = data;
  
  logger.info('Executing update_deal action', { dealId, status });
  
  // Update deal in CRM
  // This would need dea ls table integration
}

async function executeSendEmail(action, data) {
  // Send email via email service
  const { templateId, to, variables } = data;
  
  logger.info('Executing send_email action', { templateId, to });
  
  // Call email service
  // import { sendEmail } from '../services/email.service';
  // await sendEmail(templateId, to, variables);
}

async function executeUpdateContactStatus(action, data) {
  // Update contact status (e.g., 'lead' → 'customer')
  const { contactId, status = 'customer' } = data;
  
  logger.info('Executing update_contact_status action', { contactId, status });
  
  // Update contact status
}

async function executeSendReviewRequest(action, data) {
  // Schedule/send review request after deal won
  const { dealId, delayDays = 7 } = data;
  
  logger.info('Executing send_review_request action', { dealId, delayDays });
  
  // Create review request record or send email
}

async function executeCreateTask(action, data) {
  // Create task in task management
  const { taskTitle, assignedTo, dueDate } = data;
  
  logger.info('Executing create_task action', { taskTitle, assignedTo });
  
  // Create task in tasks table (if exists)
}

module.exports = router;