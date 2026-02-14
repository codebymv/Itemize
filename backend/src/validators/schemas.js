const { z } = require('zod');

module.exports = {
  // Search query validation
  searchQuery: z.object({
    q: z.string().min(2).max(100),
    types: z.array(
      z.enum(['contact', 'invoice', 'signature', 'list', 'note', 'campaign', 'workflow'])
    ).optional(),
    limit: z.number().min(1).max(100).optional().default(10),
  }),

  // Invoice validation
  invoiceCreate: z.object({
    invoice_number: z.string().min(1).max(50).optional(),
    organization_id: z.number().positive().optional(),
    customer_name: z.string().min(1).max(255).optional(),
    customer_email: z.string().email().optional(),
    customer_phone: z.string().regex(/^\+?[0-9\s\-\(\)]+$/).optional(),
    customer_address: z.string().max(1000).optional(),
    issue_date: z.string().date().optional(),
    due_date: z.string().date().optional(),
    subtotal: z.number().min(0).optional(),
    tax_amount: z.number().min(0).optional(),
    discount_amount: z.number().min(0).optional(),
    discount_type: z.enum(['none', 'fixed', 'percentage']).optional(),
    discount_value: z.number().min(0).optional(),
    total: z.number().positive(),
    amount_paid: z.number().min(0).optional(),
    amount_due: z.number().min(0).optional(),
    currency: z.string().length(3).default('USD'),
    status: z.enum(['draft', 'pending', 'paid', 'overdue', 'cancelled']).optional(),
    payment_terms: z.string().max(1000).optional(),
    payment_instructions: z.string().max(1000).optional(),
    notes: z.string().max(5000).optional(),
    terms_and_conditions: z.string().max(5000).optional(),
    contact_id: z.number().optional(),
  }),

  invoiceUpdate: z.object({
    customer_name: z.string().min(1).max(255).optional(),
    customer_email: z.string().email().optional(),
    customer_phone: z.string().regex(/^\+?[0-9\s\-\(\)]+$/).optional(),
    issue_date: z.string().date().optional(),
    due_date: z.string().date().optional(),
    subtotal: z.number().min(0).optional(),
    tax_amount: z.number().min(0).optional(),
    discount_amount: z.number().min(0).optional(),
    total: z.number().positive().optional(),
    status: z.enum(['draft', 'pending', 'paid', 'overdue', 'cancelled']).optional(),
    notes: z.string().max(5000).optional(),
  }),

  // Signature validation
  signatureCreate: z.object({
    organization_id: z.number().positive().optional(),
    title: z.string().min(3).max(255),
    description: z.string().max(2000).optional(),
    message: z.string().max(2000).optional(),
    status: z.enum(['draft', 'sent', 'viewed', 'completed', 'expired', 'failed']).optional(),
    expiration_days: z.number().min(1).max(365).optional(),
    timezone: z.string().max(50).optional(),
    locale: z.string().max(10).optional(),
  }),

  // Contact validation
  contactCreate: z.object({
    first_name: z.string().min(1).max(100),
    organization_id: z.number().positive().optional(),
    last_name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[0-9\s\-\(\)]+$/).optional(),
    company: z.string().max(255).optional(),
    job_title: z.string().max(100).optional(),
    address_line1: z.string().max(255).optional(),
    address_line2: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    postal_code: z.string().max(20).optional(),
    country: z.string().max(100).optional(),
    notes: z.string().max(5000).optional(),
    status: z.enum(['active', 'lead', 'customer', 'archived']).optional(),
    source: z.string().max(50).optional(),
    tags: z.array(z.string().max(50)).optional(),
  }),

  contactUpdate: z.object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[0-9\s\-\(\)]+$/).optional(),
    company: z.string().max(255).optional(),
    job_title: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    notes: z.string().max(5000).optional(),
    status: z.enum(['active', 'lead', 'customer', 'archived']).optional(),
  }),

  // List validation
  listCreate: z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    status: z.enum(['active', 'archived']).optional(),
    tags: z.array(z.string().max(50)).optional(),
  }),

  // Note validation
  noteCreate: z.object({
    title: z.string().min(1).max(255),
    content: z.string().max(50000).optional(),
    tags: z.array(z.string().max(50)).optional(),
  }),

  // Campaign validation
  campaignCreate: z.object({
    name: z.string().min(3).max(255),
    subject: z.string().min(3).max(255),
    description: z.string().max(2000).optional(),
    template_id: z.number().optional(),
    status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'paused']).default('draft'),
    segment_id: z.number().optional(),
  }),

  // Workflow validation
  workflowCreate: z.object({
    name: z.string().min(3).max(255),
    description: z.string().max(2000).optional(),
    trigger_type: z.enum(['manual', 'contact_created', 'contract_signed', 'invoice_paid', 'form_submitted']),
    is_active: z.boolean().optional(),
  }),

  // Form validation
  formCreate: z.object({
    name: z.string().min(3).max(255),
    description: z.string().max(2000).optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
  }),

  // Generic paginated query
  paginatedQuery: z.object({
    page: z.number().min(1).optional().default(1),
    limit: z.number().min(1).max(100).optional().default(20),
    search: z.string().min(2).max(100).optional(),
    sort_by: z.enum(['created_at', 'updated_at', 'name', 'title', 'status']).optional(),
    sort_direction: z.enum(['asc', 'desc']).optional().default('desc'),
  }),

  // Webhook validation
  webhookEvent: z.object({
    eventType: z.enum(['contract_signed', 'invoice_paid', 'form_submitted', 'contact_created']),
    entityId: z.number().optional(),
    entityData: z.object({}).optional(),
  }),
};

// Helper middleware to validate request
module.exports.validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path[0],
            message: e.message,
          })),
        });
      }
      return res.status(500).json({ error: 'Validation error' });
    }
  };
};

// Helper middleware to validate query params
module.exports.validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Query validation failed',
          details: error.errors.map(e => ({
            field: e.path[0],
            message: e.message,
          })),
        });
      }
      return res.status(500).json({ error: 'Query validation error' });
    }
  };
};