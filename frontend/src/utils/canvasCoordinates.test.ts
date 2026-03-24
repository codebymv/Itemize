import { describe, it, expect } from 'vitest';
import {
  normalizeCanvasData,
  denormalizeCanvasData,
  isNormalizedData,
  isLegacyPathsArray,
  processCanvasDataForLoad,
  processCanvasDataForSave,
  calculateMobileCanvasDimensions,
} from './canvasCoordinates';
import {
  REFERENCE_CANVAS_WIDTH,
  REFERENCE_CANVAS_HEIGHT,
} from '@/constants/dimensions';

describe('canvasCoordinates', () => {
  describe('normalizeCanvasData', () => {
    it('normalizes pixel coordinates to 0-1 range', () => {
      const paths = [
        {
          paths: [
            { x: 0, y: 0 },
            { x: 500, y: 250 },
            { x: 1000, y: 500 }
          ],
          strokeWidth: 10,
          strokeColor: '#000',
          drawMode: true
        }
      ];

      const canvasWidth = 1000;
      const canvasHeight = 500;

      const result = normalizeCanvasData(paths, canvasWidth, canvasHeight);

      expect(result.paths[0].paths).toEqual([
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 }
      ]);
    });

    it('normalizes stroke width relative to reference dimensions', () => {
      const paths = [
        {
          paths: [{ x: 0, y: 0 }],
          strokeWidth: 15,
          strokeColor: '#000',
          drawMode: true
        }
      ];

      const canvasWidth = 1000;
      const canvasHeight = 500;
      // Avg dimension = 750
      // Reference avg dimension = (1000 + 1000) / 2 = 1000
      // Expected: (15 / 750) * 1000 = 20

      const result = normalizeCanvasData(paths, canvasWidth, canvasHeight);

      expect(result.paths[0].strokeWidth).toBe(20);
    });

    it('returns standard metadata format', () => {
      const paths = [
        {
          paths: [{ x: 0, y: 0 }],
          strokeWidth: 10,
          strokeColor: '#000',
          drawMode: true
        }
      ];

      const result = normalizeCanvasData(paths, 1000, 500);

      expect(result.metadata).toEqual({
        version: 1,
        normalized: true,
        referenceWidth: REFERENCE_CANVAS_WIDTH,
        referenceHeight: REFERENCE_CANVAS_HEIGHT,
      });
    });

    it('preserves other path properties', () => {
       const paths = [
        {
          paths: [{ x: 0, y: 0 }],
          strokeWidth: 10,
          strokeColor: '#FF0000',
          drawMode: false,
          startTimestamp: 12345,
          endTimestamp: 67890,
          customProperty: 'test'
        }
      ];

      const result = normalizeCanvasData(paths, 1000, 500);

      expect(result.paths[0].strokeColor).toBe('#FF0000');
      expect(result.paths[0].drawMode).toBe(false);
      expect(result.paths[0].startTimestamp).toBe(12345);
      expect(result.paths[0].endTimestamp).toBe(67890);
      expect(result.paths[0].customProperty).toBe('test');
    });
  });

  describe('denormalizeCanvasData', () => {
    it('denormalizes 0-1 range to pixel coordinates', () => {
      const normalizedData = {
        paths: [
          {
            paths: [
              { x: 0, y: 0 },
              { x: 0.5, y: 0.5 },
              { x: 1, y: 1 }
            ],
            strokeWidth: 20,
            strokeColor: '#000',
            drawMode: true
          }
        ],
        metadata: {
          version: 1,
          normalized: true,
          referenceWidth: 1000,
          referenceHeight: 1000,
        }
      };

      const canvasWidth = 1000;
      const canvasHeight = 500;

      const result = denormalizeCanvasData(normalizedData, canvasWidth, canvasHeight);

      expect(result[0].paths).toEqual([
        { x: 0, y: 0 },
        { x: 500, y: 250 },
        { x: 1000, y: 500 }
      ]);
    });

    it('denormalizes stroke width relative to target dimensions', () => {
      const normalizedData = {
        paths: [
          {
            paths: [{ x: 0, y: 0 }],
            strokeWidth: 20,
            strokeColor: '#000',
            drawMode: true
          }
        ],
        metadata: {
          version: 1,
          normalized: true,
          referenceWidth: 1000,
          referenceHeight: 1000,
        }
      };

      const canvasWidth = 1000;
      const canvasHeight = 500;
      // Avg dimension = 750
      // Reference avg dimension = 1000
      // Expected: (20 / 1000) * 750 = 15

      const result = denormalizeCanvasData(normalizedData, canvasWidth, canvasHeight);

      expect(result[0].strokeWidth).toBe(15);
    });

    it('preserves other path properties during denormalization', () => {
      const normalizedData = {
        paths: [
          {
            paths: [{ x: 0, y: 0 }],
            strokeWidth: 20,
            strokeColor: '#00FF00',
            drawMode: true,
            startTimestamp: 111,
            endTimestamp: 222,
            anotherProp: 'value'
          }
        ],
        metadata: {
          version: 1,
          normalized: true,
          referenceWidth: 1000,
          referenceHeight: 1000,
        }
      };

      const result = denormalizeCanvasData(normalizedData, 1000, 500);

      expect(result[0].strokeColor).toBe('#00FF00');
      expect(result[0].drawMode).toBe(true);
      expect(result[0].startTimestamp).toBe(111);
      expect(result[0].endTimestamp).toBe(222);
      expect(result[0].anotherProp).toBe('value');
    });
  });

  describe('isNormalizedData', () => {
    it('returns true for properly formatted normalized data', () => {
      const validData = {
        paths: [],
        metadata: {
          normalized: true,
          version: 1,
          referenceWidth: 1000,
          referenceHeight: 1000,
        }
      };

      expect(isNormalizedData(validData)).toBe(true);
    });

    it('returns false for legacy paths array', () => {
      const legacyData = [
        { paths: [], strokeWidth: 10, strokeColor: '#000', drawMode: true }
      ];

      expect(isNormalizedData(legacyData)).toBe(false);
    });

    it('returns false for null, undefined, or primitives', () => {
      expect(isNormalizedData(null)).toBe(false);
      expect(isNormalizedData(undefined)).toBe(false);
      expect(isNormalizedData('string')).toBe(false);
      expect(isNormalizedData(123)).toBe(false);
    });

    it('returns false if metadata is missing or invalid', () => {
      expect(isNormalizedData({ paths: [] })).toBe(false);
      expect(isNormalizedData({ paths: [], metadata: null })).toBe(false);
      expect(isNormalizedData({ paths: [], metadata: 'string' })).toBe(false);
      expect(isNormalizedData({ paths: [], metadata: { normalized: false } })).toBe(false);
    });
  });

  describe('isLegacyPathsArray', () => {
    it('returns true for an array', () => {
      const legacyData = [
        { paths: [], strokeWidth: 10, strokeColor: '#000', drawMode: true }
      ];
      expect(isLegacyPathsArray(legacyData)).toBe(true);
      expect(isLegacyPathsArray([])).toBe(true);
    });

    it('returns false for normalized data objects', () => {
      const normalizedData = {
        paths: [],
        metadata: { normalized: true, version: 1, referenceWidth: 1000, referenceHeight: 1000 }
      };
      expect(isLegacyPathsArray(normalizedData)).toBe(false);
    });

    it('returns false for string, null, or undefined', () => {
      expect(isLegacyPathsArray('[]')).toBe(false);
      expect(isLegacyPathsArray(null)).toBe(false);
      expect(isLegacyPathsArray(undefined)).toBe(false);
    });
  });

  describe('processCanvasDataForLoad', () => {
    it('returns empty array for null/undefined data', () => {
      expect(processCanvasDataForLoad(null, 1000, 500)).toEqual([]);
      expect(processCanvasDataForLoad(undefined, 1000, 500)).toEqual([]);
    });

    it('denormalizes already normalized data', () => {
      const normalizedData = {
        paths: [
          {
            paths: [{ x: 0.5, y: 0.5 }],
            strokeWidth: 20,
            strokeColor: '#000',
            drawMode: true
          }
        ],
        metadata: {
          normalized: true,
          version: 1,
          referenceWidth: 1000,
          referenceHeight: 1000,
        }
      };

      const result = processCanvasDataForLoad(normalizedData, 1000, 500);

      expect(result[0].paths).toEqual([{ x: 500, y: 250 }]);
    });

    it('returns legacy array unchanged if no original dimensions provided', () => {
      const legacyData = [
        {
          paths: [{ x: 500, y: 250 }],
          strokeWidth: 10,
          strokeColor: '#000',
          drawMode: true
        }
      ];

      const result = processCanvasDataForLoad(legacyData, 1000, 500);

      expect(result).toEqual(legacyData);
    });

    it('scales legacy array if original dimensions differ', () => {
      const legacyData = [
        {
          paths: [{ x: 500, y: 250 }],
          strokeWidth: 10,
          strokeColor: '#000',
          drawMode: true
        }
      ];

      // original dimensions: 1000x500
      // current dimensions: 2000x1000
      // scale = 2
      const result = processCanvasDataForLoad(legacyData, 2000, 1000, 1000, 500);

      expect(result[0].paths).toEqual([{ x: 1000, y: 500 }]);
      expect(result[0].strokeWidth).toBe(20);
    });

    it('parses valid JSON string and processes it', () => {
      const legacyData = [
        {
          paths: [{ x: 500, y: 250 }],
          strokeWidth: 10,
          strokeColor: '#000',
          drawMode: true
        }
      ];

      const jsonString = JSON.stringify(legacyData);
      const result = processCanvasDataForLoad(jsonString, 1000, 500);

      expect(result).toEqual(legacyData);
    });

    it('returns empty array for invalid JSON string', () => {
      expect(processCanvasDataForLoad('invalid json', 1000, 500)).toEqual([]);
    });

    it('returns empty array for unknown format', () => {
      expect(processCanvasDataForLoad(12345, 1000, 500)).toEqual([]);
    });
  });

  describe('processCanvasDataForSave', () => {
    it('normalizes canvas data for saving', () => {
      const paths = [
        {
          paths: [{ x: 500, y: 250 }],
          strokeWidth: 10,
          strokeColor: '#000',
          drawMode: true
        }
      ];

      const result = processCanvasDataForSave(paths, 1000, 500);

      expect(result.metadata.normalized).toBe(true);
      expect(result.paths[0].paths).toEqual([{ x: 0.5, y: 0.5 }]);
    });
  });

  describe('calculateMobileCanvasDimensions', () => {
    it('calculates mobile dimensions correctly based on aspect ratio', () => {
      const result = calculateMobileCanvasDimensions(400, 4/3);
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });
  });
});
