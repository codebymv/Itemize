import { describe, it, expect } from 'vitest';
import { calculateMobileCanvasDimensions } from './canvasCoordinates';

describe('calculateMobileCanvasDimensions', () => {
  it('should calculate dimensions for a 16:9 aspect ratio', () => {
    const result = calculateMobileCanvasDimensions(1920, 16 / 9);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it('should calculate dimensions for a 4:3 aspect ratio', () => {
    const result = calculateMobileCanvasDimensions(1024, 4 / 3);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
  });

  it('should calculate dimensions for a 1:1 aspect ratio', () => {
    const result = calculateMobileCanvasDimensions(500, 1);
    expect(result.width).toBe(500);
    expect(result.height).toBe(500);
  });

  it('should handle zero container width', () => {
    const result = calculateMobileCanvasDimensions(0, 16 / 9);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('should handle zero aspect ratio by returning Infinity for height', () => {
    const result = calculateMobileCanvasDimensions(1000, 0);
    expect(result.width).toBe(1000);
    expect(result.height).toBe(Infinity);
  });

  it('should handle negative aspect ratio', () => {
    const result = calculateMobileCanvasDimensions(1000, -2);
    expect(result.width).toBe(1000);
    expect(result.height).toBe(-500);
  });

  it('should handle negative container width', () => {
    const result = calculateMobileCanvasDimensions(-1000, 2);
    expect(result.width).toBe(-1000);
    expect(result.height).toBe(-500);
  });
});
