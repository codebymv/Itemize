// ============================================
// Input Validation Schemas
// Using Zod for runtime validation
// ============================================

const { z } = require('zod');

// Password requirements: 8+ chars, uppercase, lowercase, number
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Email schema with normalization
const emailSchema = z
  .string()
  .email('Invalid email address')
  .transform(email => email.toLowerCase().trim());

// Name schema
const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(255, 'Name must be less than 255 characters')
  .trim();

// Registration schema
const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
});

// Login schema (less strict - we just need credentials)
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// Password reset request schema
const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// Password reset schema (with new password validation)
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

// Change password schema (authenticated)
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// Email verification schema
const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// Resend verification schema
const resendVerificationSchema = z.object({
  email: emailSchema,
});

// Update profile schema
const updateProfileSchema = z.object({
  name: nameSchema.optional(),
});

/**
 * Validate request body against a schema
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 * @returns {Function} Express middleware
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.body);
      req.validatedBody = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0]?.message || 'Validation failed',
            details: error.errors,
          },
        });
      }
      next(error);
    }
  };
}

module.exports = {
  // Schemas
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  updateProfileSchema,
  passwordSchema,
  emailSchema,
  nameSchema,
  // Middleware
  validate,
};
