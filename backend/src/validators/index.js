/**
 * Input Validation Schemas using express-validator
 * Centralized validation rules for API endpoints
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation middleware - checks for validation errors and returns standardized response
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors.array().map(err => ({
                    field: err.path,
                    message: err.msg,
                    value: err.value
                }))
            }
        });
    }
    next();
};

/**
 * Common validators for reuse across routes
 */
const validators = {
    // Contact validators
    createContact: [
        body('email').optional().isEmail().withMessage('Invalid email format').normalizeEmail(),
        body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
        body('first_name').optional().trim().isLength({ max: 100 }).withMessage('First name too long'),
        body('last_name').optional().trim().isLength({ max: 100 }).withMessage('Last name too long'),
        body('company').optional().trim().isLength({ max: 200 }).withMessage('Company name too long'),
        body('job_title').optional().trim().isLength({ max: 100 }).withMessage('Job title too long'),
        validate
    ],

    updateContact: [
        param('id').isInt({ min: 1 }).withMessage('Invalid contact ID'),
        body('email').optional().isEmail().withMessage('Invalid email format').normalizeEmail(),
        body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
        body('first_name').optional().trim().isLength({ max: 100 }).withMessage('First name too long'),
        body('last_name').optional().trim().isLength({ max: 100 }).withMessage('Last name too long'),
        body('status').optional().isIn(['active', 'inactive', 'archived']).withMessage('Invalid status'),
        validate
    ],

    // Organization validators
    organizationId: [
        param('id').isInt({ min: 1 }).withMessage('Invalid organization ID'),
        validate
    ],

    // Pagination validators
    pagination: [
        query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100'),
        validate
    ],

    // Pipeline validators
    createPipeline: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Pipeline name required and max 100 chars'),
        body('stages').optional().isArray().withMessage('Stages must be an array'),
        validate
    ],

    createDeal: [
        body('title').notEmpty().trim().isLength({ max: 200 }).withMessage('Deal title required'),
        body('value').optional().isFloat({ min: 0 }).withMessage('Value must be a positive number'),
        body('stage_id').isInt({ min: 1 }).withMessage('Valid stage ID required'),
        validate
    ],

    // Email template validators
    createEmailTemplate: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Template name required'),
        body('subject').notEmpty().trim().isLength({ max: 200 }).withMessage('Subject required'),
        body('body_html').notEmpty().withMessage('HTML body required'),
        validate
    ],

    // Page validators
    createPage: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Page name required'),
        body('slug').optional().trim().isLength({ max: 100 })
            .matches(/^[a-z0-9-]+$/).withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),
        validate
    ],

    // Calendar validators
    createCalendar: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Calendar name required'),
        body('slot_duration').optional().isInt({ min: 5, max: 480 }).withMessage('Slot duration must be 5-480 minutes'),
        validate
    ],

    createBooking: [
        body('calendar_id').isInt({ min: 1 }).withMessage('Valid calendar ID required'),
        body('start_time').isISO8601().withMessage('Valid start time required'),
        body('end_time').isISO8601().withMessage('Valid end time required'),
        body('attendee_email').isEmail().withMessage('Valid attendee email required'),
        validate
    ],

    // Form validators
    createForm: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Form name required'),
        body('fields').optional().isArray().withMessage('Fields must be an array'),
        validate
    ],

    // Workflow validators
    createWorkflow: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Workflow name required'),
        body('trigger_type').notEmpty().withMessage('Trigger type required'),
        validate
    ],

    // Invoice validators
    createInvoice: [
        body('contact_id').isInt({ min: 1 }).withMessage('Valid contact ID required'),
        body('items').isArray({ min: 1 }).withMessage('At least one item required'),
        body('items.*.description').notEmpty().withMessage('Item description required'),
        body('items.*.amount').isFloat({ min: 0 }).withMessage('Item amount must be positive'),
        validate
    ],

    // Campaign validators
    createCampaign: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Campaign name required'),
        body('type').isIn(['email', 'sms']).withMessage('Campaign type must be email or sms'),
        validate
    ],

    // Segment validators
    createSegment: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Segment name required'),
        body('conditions').isArray({ min: 1 }).withMessage('At least one condition required'),
        validate
    ],

    // SMS template validators
    createSmsTemplate: [
        body('name').notEmpty().trim().isLength({ max: 100 }).withMessage('Template name required'),
        body('message').notEmpty().isLength({ max: 1600 }).withMessage('Message required (max 1600 chars)'),
        validate
    ],

    // Tag validators
    createTag: [
        body('name').notEmpty().trim().isLength({ max: 50 }).withMessage('Tag name required (max 50 chars)'),
        body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid color format'),
        validate
    ],

    // ID param validator
    idParam: [
        param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
        validate
    ],

    // Generic search
    searchQuery: [
        query('search').optional().trim().isLength({ max: 200 }).withMessage('Search query too long'),
        query('sort_by').optional().trim().isLength({ max: 50 }),
        query('sort_order').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
        validate
    ]
};

module.exports = { 
    validate, 
    validators, 
    body, 
    param, 
    query,
    validationResult
};
