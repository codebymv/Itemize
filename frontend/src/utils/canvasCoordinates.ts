/**
 * Canvas Coordinate Normalization Utilities
 * 
 * These utilities handle transforming stroke coordinates between:
 * - Absolute pixel coordinates (used for rendering)
 * - Normalized coordinates (0-1 range, used for storage)
 * 
 * This allows whiteboards to be viewed on different screen sizes
 * without losing stroke precision.
 */

import {
  REFERENCE_CANVAS_WIDTH,
  REFERENCE_CANVAS_HEIGHT,
} from '@/constants/dimensions';

/**
 * A point in a stroke path
 */
interface StrokePoint {
  x: number;
  y: number;
}

/**
 * A stroke path from react-sketch-canvas
 */
interface CanvasPath {
  paths: StrokePoint[];
  strokeWidth: number;
  strokeColor: string;
  drawMode: boolean;
  startTimestamp?: number;
  endTimestamp?: number;
  [key: string]: unknown;
}

/**
 * Metadata to track coordinate format
 */
interface CanvasDataMetadata {
  version: number;
  normalized: boolean;
  referenceWidth: number;
  referenceHeight: number;
}

/**
 * Canvas data with metadata
 */
export interface NormalizedCanvasData {
  paths: CanvasPath[];
  metadata: CanvasDataMetadata;
}

/**
 * Check if canvas data is already normalized (has metadata)
 */
export function isNormalizedData(data: unknown): data is NormalizedCanvasData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.metadata !== undefined &&
    typeof obj.metadata === 'object' &&
    (obj.metadata as CanvasDataMetadata).normalized === true
  );
}

/**
 * Check if data is raw paths array (legacy format)
 */
export function isLegacyPathsArray(data: unknown): data is CanvasPath[] {
  return Array.isArray(data);
}

/**
 * Normalize a single point from pixel coordinates to 0-1 range
 */
function normalizePoint(
  point: StrokePoint,
  canvasWidth: number,
  canvasHeight: number
): StrokePoint {
  return {
    x: point.x / canvasWidth,
    y: point.y / canvasHeight,
  };
}

/**
 * Denormalize a single point from 0-1 range to pixel coordinates
 */
function denormalizePoint(
  point: StrokePoint,
  canvasWidth: number,
  canvasHeight: number
): StrokePoint {
  return {
    x: point.x * canvasWidth,
    y: point.y * canvasHeight,
  };
}

/**
 * Normalize stroke width based on reference dimensions
 */
function normalizeStrokeWidth(
  strokeWidth: number,
  canvasWidth: number,
  canvasHeight: number
): number {
  // Use the average of width and height for stroke normalization
  const avgDimension = (canvasWidth + canvasHeight) / 2;
  const refAvgDimension = (REFERENCE_CANVAS_WIDTH + REFERENCE_CANVAS_HEIGHT) / 2;
  return (strokeWidth / avgDimension) * refAvgDimension;
}

/**
 * Denormalize stroke width based on current canvas dimensions
 */
function denormalizeStrokeWidth(
  normalizedWidth: number,
  canvasWidth: number,
  canvasHeight: number
): number {
  const avgDimension = (canvasWidth + canvasHeight) / 2;
  const refAvgDimension = (REFERENCE_CANVAS_WIDTH + REFERENCE_CANVAS_HEIGHT) / 2;
  return (normalizedWidth / refAvgDimension) * avgDimension;
}

/**
 * Normalize canvas paths for storage
 * Converts pixel coordinates to 0-1 normalized range
 */
export function normalizeCanvasData(
  paths: CanvasPath[],
  canvasWidth: number,
  canvasHeight: number
): NormalizedCanvasData {
  const normalizedPaths = paths.map((path) => ({
    ...path,
    paths: path.paths.map((point) =>
      normalizePoint(point, canvasWidth, canvasHeight)
    ),
    strokeWidth: normalizeStrokeWidth(path.strokeWidth, canvasWidth, canvasHeight),
  }));

  return {
    paths: normalizedPaths,
    metadata: {
      version: 1,
      normalized: true,
      referenceWidth: REFERENCE_CANVAS_WIDTH,
      referenceHeight: REFERENCE_CANVAS_HEIGHT,
    },
  };
}

/**
 * Denormalize canvas paths for rendering
 * Converts 0-1 normalized range to pixel coordinates
 */
export function denormalizeCanvasData(
  data: NormalizedCanvasData,
  canvasWidth: number,
  canvasHeight: number
): CanvasPath[] {
  return data.paths.map((path) => ({
    ...path,
    paths: path.paths.map((point) =>
      denormalizePoint(point, canvasWidth, canvasHeight)
    ),
    strokeWidth: denormalizeStrokeWidth(path.strokeWidth, canvasWidth, canvasHeight),
  }));
}

/**
 * Process canvas data for loading
 * Handles both legacy (pixel-based) and new (normalized) formats
 */
export function processCanvasDataForLoad(
  data: unknown,
  canvasWidth: number,
  canvasHeight: number,
  originalWidth?: number,
  originalHeight?: number
): CanvasPath[] {
  // Handle null/undefined
  if (!data) {
    return [];
  }

  // Handle already normalized data
  if (isNormalizedData(data)) {
    return denormalizeCanvasData(data, canvasWidth, canvasHeight);
  }

  // Handle legacy paths array
  if (isLegacyPathsArray(data)) {
    // If we have original dimensions and they differ from current,
    // scale the paths proportionally
    if (
      originalWidth &&
      originalHeight &&
      (originalWidth !== canvasWidth || originalHeight !== canvasHeight)
    ) {
      const scaleX = canvasWidth / originalWidth;
      const scaleY = canvasHeight / originalHeight;
      const avgScale = (scaleX + scaleY) / 2;

      return data.map((path) => ({
        ...path,
        paths: path.paths.map((point) => ({
          x: point.x * scaleX,
          y: point.y * scaleY,
        })),
        strokeWidth: path.strokeWidth * avgScale,
      }));
    }
    
    // No scaling needed
    return data;
  }

  // Handle string data (JSON)
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return processCanvasDataForLoad(
        parsed,
        canvasWidth,
        canvasHeight,
        originalWidth,
        originalHeight
      );
    } catch {
      return [];
    }
  }

  // Unknown format
  return [];
}

/**
 * Process canvas data for saving
 * Always saves in normalized format for future compatibility
 */
export function processCanvasDataForSave(
  paths: CanvasPath[],
  canvasWidth: number,
  canvasHeight: number
): NormalizedCanvasData {
  return normalizeCanvasData(paths, canvasWidth, canvasHeight);
}

/**
 * Calculate canvas dimensions for mobile based on container width and aspect ratio
 */
export function calculateMobileCanvasDimensions(
  containerWidth: number,
  aspectRatio: number
): { width: number; height: number } {
  const width = containerWidth;
  const height = containerWidth / aspectRatio;
  return { width, height };
}
