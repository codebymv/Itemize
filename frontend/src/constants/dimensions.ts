// List dimensions
export const MIN_LIST_WIDTH = 320;

// Note dimensions
export const MIN_NOTE_WIDTH = 570;

// Whiteboard dimensions
export const MIN_WHITEBOARD_WIDTH = 750;
export const MIN_WHITEBOARD_HEIGHT = 650;
export const MAX_WHITEBOARD_WIDTH = 2400;
export const MAX_WHITEBOARD_HEIGHT = 2400;

// Default whiteboard dimensions
export const DEFAULT_WHITEBOARD_WIDTH = 750;
export const DEFAULT_WHITEBOARD_HEIGHT = 620;

// Mobile whiteboard aspect ratios
export const MOBILE_ASPECT_RATIOS = {
  '4:3': 4 / 3,    // Standard (default for mobile)
  '16:9': 16 / 9,  // Widescreen
  '1:1': 1,        // Square
  '3:4': 3 / 4,    // Portrait
} as const;

export type MobileAspectRatio = keyof typeof MOBILE_ASPECT_RATIOS;

// Default mobile aspect ratio
export const DEFAULT_MOBILE_ASPECT_RATIO: MobileAspectRatio = '4:3';

// Reference dimensions for coordinate normalization
// All coordinates are normalized relative to these reference dimensions
export const REFERENCE_CANVAS_WIDTH = 1000;
export const REFERENCE_CANVAS_HEIGHT = 1000;