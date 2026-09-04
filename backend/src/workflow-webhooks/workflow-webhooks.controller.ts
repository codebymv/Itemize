import { Body, Controller, Logger, Param, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { HttpProviderWebhookScoped } from '../common/metadata';
import { normalizeWorkflowTrigger, WORKFLOW_TRIGGER_TYPES } from '../workflows/workflow.registry';
import {
  verifyWorkflowWebhook,
  WorkflowWebhooksService,
} from './workflow-webhooks.service';

const TRIGGER_ALIAS_NAMES = ['contact_created', 'deal_status_changed'];
const acceptedWorkflowTriggerTypes = [
  ...WORKFLOW_TRIGGER_TYPES,
  ...TRIGGER_ALIAS_NAMES,
];
const workflowTriggerType = z.string().refine(
  (value) => normalizeWorkflowTrigger(value) !== null,
  { message: `Must be one of: ${acceptedWorkflowTriggerTypes.join(', ')}` },
);
const webhookEventSchema = z.object({
  eventType: workflowTriggerType,
  contactId: z.number().int().positive().optional(),
  entityId: z.number().int().positive().optional(),
  entityData: z
    .object({
      contactId: z.number().int().positive().optional(),
      entityId: z.number().int().positive().optional(),
      entityType: z.string().min(1).max(50).optional(),
    })
    .passthrough()
    .optional(),
});

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/webhooks')
@HttpProviderWebhookScoped()
export class WorkflowWebhooksController {
  private readonly logger = new Logger(WorkflowWebhooksController.name);

  constructor(private readonly webhooks: WorkflowWebhooksService) {}

  @Post(':workflowId')
  async receive(
    @Param('workflowId') workflowId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: RawBodyRequest,
    @Res() response: Response,
  ): Promise<void> {
    const parsedBody = body ?? {};
    const validation = webhookEventSchema.safeParse(parsedBody);
    if (!validation.success) {
      response.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues.map((issue) => ({
          field: issue.path[0],
          message: issue.message,
        })),
      });
      return;
    }

    const { contactId, eventType, entityId } = parsedBody as {
      contactId?: number;
      eventType: string;
      entityId?: number;
    };
    const entityData =
      (parsedBody.entityData as Record<string, unknown> | undefined) ?? {};
    const normalizedEventType = normalizeWorkflowTrigger(eventType) as string;
    const resolvedEntityId =
      (entityId ?? (entityData?.entityId as number | undefined)) ?? null;
    const resolvedContactId =
      (contactId ?? (entityData?.contactId as number | undefined)) ?? null;

    try {
      const workflow = await this.webhooks.findWorkflow(workflowId);
      if (!workflow) {
        response.status(404).json({ error: 'Workflow not found' });
        return;
      }

      const signatureCheck = verifyWorkflowWebhook(
        {
          signature: request.headers['x-itemize-signature'],
          timestamp: request.headers['x-itemize-timestamp'],
          rawBody: request.rawBody,
          parsedBody,
        },
        workflow.webhook_secret,
      );
      if (!signatureCheck.ok) {
        response
          .status(signatureCheck.status)
          .json({ error: signatureCheck.message });
        return;
      }

      if (!workflow.is_active) {
        response.status(200).json({
          success: false,
          message: 'Workflow is not active',
          workflowId,
        });
        return;
      }

      if (normalizedEventType !== workflow.trigger_type) {
        response.status(409).json({
          success: false,
          error: 'Webhook event does not match the workflow trigger',
          expectedEventType: workflow.trigger_type,
          receivedEventType: normalizedEventType,
        });
        return;
      }

      const rawDeliveryId = request.headers['x-itemize-delivery-id'];
      const deliveryId = String(
        (Array.isArray(rawDeliveryId) ? rawDeliveryId[0] : rawDeliveryId) || '',
      ).trim();
      if (deliveryId.length > 200) {
        response.status(400).json({ error: 'Webhook delivery ID is too long' });
        return;
      }
      const rawSignature = request.headers['x-itemize-signature'];
      const deliveryKey =
        deliveryId ||
        `signature:${Array.isArray(rawSignature) ? rawSignature[0] : rawSignature}`;

      this.logger.log(
        `Workflow trigger received: workflow ${workflowId}, event ${normalizedEventType}`,
      );

      // Mirrors workflowTriggerEventKey: identities beyond 220 characters
      // (for example an oversized signature header) fail like the retained
      // route, as a processing error rather than a silent truncation.
      const identity = `${workflowId}:${deliveryKey}`.trim();
      if (!identity || identity.length > 220) {
        throw new Error('Workflow trigger identity is invalid');
      }

      const trigger = await this.webhooks.enqueueWebhookTrigger({
        workflowId: workflow.id,
        organizationId: workflow.organization_id,
        contactId: resolvedContactId,
        deliveryKey,
        entityId: resolvedEntityId,
        entityType: (entityData?.entityType as string | undefined) || null,
        eventKey: `webhook:${identity}`,
        payload: entityData,
        triggerType: normalizedEventType,
      });

      if (!trigger.inserted) {
        response.status(200).json({
          success: true,
          duplicate: true,
          message: 'Webhook delivery already recorded',
          workflowId,
        });
        return;
      }

      response.status(202).json({
        success: true,
        accepted: true,
        triggerId: trigger.id,
        workflowId,
        eventType: normalizedEventType,
        execution: 'durably_queued',
        message: 'Trigger recorded for asynchronous workflow enrollment',
      });
    } catch (error) {
      this.logger.error(
        `Webhook processing error: ${(error as Error).message}`,
      );
      response.status(500).json({
        success: false,
        message: 'Processing failed',
        error: (error as Error).message,
      });
    }
  }
}
