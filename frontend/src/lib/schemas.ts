/**
 * Zod Schemas for API Payload Validation
 * 
 * These schemas validate data before sending to the API,
 * providing type safety and runtime validation.
 */

import { z } from 'zod';

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Hex color code validation
 */
export const hexColorSchema = z.string().regex(
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  'Invalid hex color format'
);

/**
 * Position coordinates
 */
export const positionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
});

/**
 * Dimensions
 */
export const dimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

// =============================================================================
// List Schemas
// =============================================================================

/**
 * List item schema
 */
export const listItemSchema = z.object({
  id: z.string(),
  text: z.string().max(1000, 'Item text too long'),
  checked: z.boolean(),
});

/**
 * Create list payload
 */
export const createListSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  type: z.string().max(50).optional().default('General'),
  color_value: hexColorSchema.optional().default('#3B82F6'),
  position_x: z.number().min(0),
  position_y: z.number().min(0),
  width: z.number().positive().optional(),
  z_index: z.number().int().optional(),
  items: z.array(listItemSchema).optional().default([]),
});

/**
 * Update list payload
 */
export const updateListSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.string().max(50).optional(),
  color_value: hexColorSchema.optional(),
  position_x: z.number().min(0).optional(),
  position_y: z.number().min(0).optional(),
  width: z.number().positive().optional(),
  z_index: z.number().int().optional(),
  items: z.array(listItemSchema).optional(),
});

/**
 * Update list position payload
 */
export const updateListPositionSchema = z.object({
  position_x: z.number().min(0),
  position_y: z.number().min(0),
  width: z.number().positive().optional(),
  z_index: z.number().int().optional(),
});

// =============================================================================
// Note Schemas
// =============================================================================

/**
 * Create note payload
 */
export const createNoteSchema = z.object({
  title: z.string().max(200, 'Title too long').optional().default('Untitled Note'),
  content: z.string().max(50000, 'Content too long').optional().default(''),
  category: z.string().max(50).optional(),
  color_value: hexColorSchema.optional().default('#3B82F6'),
  position_x: z.number().min(0),
  position_y: z.number().min(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  z_index: z.number().int().optional(),
});

/**
 * Update note payload
 */
export const updateNoteSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(50000).optional(),
  category: z.string().max(50).optional(),
  color_value: hexColorSchema.optional(),
  position_x: z.number().min(0).optional(),
  position_y: z.number().min(0).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  z_index: z.number().int().optional(),
});

// =============================================================================
// Whiteboard Schemas
// =============================================================================

/**
 * Canvas path point
 */
export const canvasPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Canvas stroke path
 */
export const canvasPathSchema = z.object({
  drawMode: z.boolean().optional(),
  strokeColor: z.string(),
  strokeWidth: z.number().positive(),
  paths: z.array(canvasPointSchema),
});

/**
 * Canvas data can be:
 * - An array of paths (legacy format)
 * - An object with paths and metadata (normalized format)
 */
export const canvasDataSchema = z.union([
  z.array(canvasPathSchema),
  z.object({
    paths: z.array(canvasPathSchema),
    metadata: z.object({
      version: z.number(),
      normalized: z.boolean(),
      referenceWidth: z.number(),
      referenceHeight: z.number(),
    }),
  }),
  z.null(),
]);

/**
 * Create whiteboard payload
 */
export const createWhiteboardSchema = z.object({
  title: z.string().max(200).optional().default('Untitled Whiteboard'),
  category: z.string().max(50).optional(),
  canvas_data: canvasDataSchema.optional().default([]),
  canvas_width: z.number().positive().optional().default(750),
  canvas_height: z.number().positive().optional().default(620),
  background_color: hexColorSchema.optional().default('#ffffff'),
  color_value: hexColorSchema.optional().default('#3B82F6'),
  position_x: z.number().min(0),
  position_y: z.number().min(0),
  z_index: z.number().int().optional(),
});

/**
 * Update whiteboard payload
 */
export const updateWhiteboardSchema = z.object({
  title: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  canvas_data: canvasDataSchema.optional(),
  canvas_width: z.number().positive().optional(),
  canvas_height: z.number().positive().optional(),
  background_color: hexColorSchema.optional(),
  color_value: hexColorSchema.optional(),
  position_x: z.number().min(0).optional(),
  position_y: z.number().min(0).optional(),
  z_index: z.number().int().optional(),
});

/**
 * Update whiteboard position payload
 */
export const updateWhiteboardPositionSchema = z.object({
  position_x: z.number().min(0),
  position_y: z.number().min(0),
  z_index: z.number().int().optional(),
});

// =============================================================================
// Category Schemas
// =============================================================================

/**
 * Create category payload
 */
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(50, 'Category name too long'),
  color_value: hexColorSchema.optional().default('#3B82F6'),
});

/**
 * Update category payload
 */
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color_value: hexColorSchema.optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type CreateListPayload = z.infer<typeof createListSchema>;
export type UpdateListPayload = z.infer<typeof updateListSchema>;
export type UpdateListPositionPayload = z.infer<typeof updateListPositionSchema>;

export type CreateNotePayload = z.infer<typeof createNoteSchema>;
export type UpdateNotePayload = z.infer<typeof updateNoteSchema>;

export type CreateWhiteboardPayload = z.infer<typeof createWhiteboardSchema>;
export type UpdateWhiteboardPayload = z.infer<typeof updateWhiteboardSchema>;
export type UpdateWhiteboardPositionPayload = z.infer<typeof updateWhiteboardPositionSchema>;

export type CreateCategoryPayload = z.infer<typeof createCategorySchema>;
export type UpdateCategoryPayload = z.infer<typeof updateCategorySchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate and parse data with a schema
 * Throws ZodError if validation fails
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data with a schema
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
