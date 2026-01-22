/**
 * Tests for Zod Schemas
 */

import { describe, it, expect } from 'vitest';
import {
  createListSchema,
  createNoteSchema,
  createWhiteboardSchema,
  hexColorSchema,
  validate,
  safeValidate,
} from './schemas';

describe('hexColorSchema', () => {
  it('should accept valid 6-digit hex colors', () => {
    expect(hexColorSchema.safeParse('#3B82F6').success).toBe(true);
    expect(hexColorSchema.safeParse('#ffffff').success).toBe(true);
    expect(hexColorSchema.safeParse('#000000').success).toBe(true);
  });

  it('should accept valid 3-digit hex colors', () => {
    expect(hexColorSchema.safeParse('#fff').success).toBe(true);
    expect(hexColorSchema.safeParse('#000').success).toBe(true);
  });

  it('should reject invalid hex colors', () => {
    expect(hexColorSchema.safeParse('3B82F6').success).toBe(false); // Missing #
    expect(hexColorSchema.safeParse('#gggggg').success).toBe(false); // Invalid chars
    expect(hexColorSchema.safeParse('#12345').success).toBe(false); // Wrong length
    expect(hexColorSchema.safeParse('red').success).toBe(false); // Color name
  });
});

describe('createListSchema', () => {
  it('should validate a valid list payload', () => {
    const payload = {
      title: 'My List',
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createListSchema, payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My List');
      expect(result.data.type).toBe('General'); // Default
      expect(result.data.color_value).toBe('#3B82F6'); // Default
    }
  });

  it('should reject empty title', () => {
    const payload = {
      title: '',
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createListSchema, payload);
    expect(result.success).toBe(false);
  });

  it('should reject title longer than 200 characters', () => {
    const payload = {
      title: 'a'.repeat(201),
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createListSchema, payload);
    expect(result.success).toBe(false);
  });

  it('should reject negative positions', () => {
    const payload = {
      title: 'My List',
      position_x: -100,
      position_y: 200,
    };

    const result = safeValidate(createListSchema, payload);
    expect(result.success).toBe(false);
  });
});

describe('createNoteSchema', () => {
  it('should validate a valid note payload', () => {
    const payload = {
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createNoteSchema, payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Untitled Note'); // Default
      expect(result.data.content).toBe(''); // Default
    }
  });

  it('should accept custom title and content', () => {
    const payload = {
      title: 'My Note',
      content: 'Some content here',
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createNoteSchema, payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My Note');
      expect(result.data.content).toBe('Some content here');
    }
  });

  it('should reject content longer than 50000 characters', () => {
    const payload = {
      content: 'a'.repeat(50001),
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createNoteSchema, payload);
    expect(result.success).toBe(false);
  });
});

describe('createWhiteboardSchema', () => {
  it('should validate a valid whiteboard payload', () => {
    const payload = {
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createWhiteboardSchema, payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Untitled Whiteboard'); // Default
      expect(result.data.canvas_width).toBe(750); // Default
      expect(result.data.canvas_height).toBe(620); // Default
      expect(result.data.background_color).toBe('#ffffff'); // Default
    }
  });

  it('should accept custom canvas data', () => {
    const payload = {
      title: 'My Whiteboard',
      canvas_data: [
        {
          drawMode: true,
          strokeColor: '#000000',
          strokeWidth: 2,
          paths: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createWhiteboardSchema, payload);
    expect(result.success).toBe(true);
  });

  it('should accept null canvas data', () => {
    const payload = {
      canvas_data: null,
      position_x: 100,
      position_y: 200,
    };

    const result = safeValidate(createWhiteboardSchema, payload);
    expect(result.success).toBe(true);
  });
});

describe('validate helper', () => {
  it('should return parsed data for valid input', () => {
    const payload = {
      title: 'Test',
      position_x: 100,
      position_y: 200,
    };

    const result = validate(createListSchema, payload);
    expect(result.title).toBe('Test');
  });

  it('should throw ZodError for invalid input', () => {
    const payload = {
      title: '',
      position_x: 100,
      position_y: 200,
    };

    expect(() => validate(createListSchema, payload)).toThrow();
  });
});
