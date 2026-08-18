export type WhiteboardSketchPoint = { x: number; y: number };

export type WhiteboardSketchPath = {
  drawMode: boolean;
  strokeColor: string;
  strokeWidth: number;
  paths: WhiteboardSketchPoint[];
};

export function normalizeWhiteboardCanvasData(value: unknown): unknown[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed) as unknown;
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (
    parsed
    && typeof parsed === 'object'
    && Array.isArray((parsed as { paths?: unknown }).paths)
  ) {
    return (parsed as { paths: unknown[] }).paths;
  }
  throw new Error('Whiteboard canvas data must be a path array');
}

function isSketchPoint(value: unknown): value is WhiteboardSketchPoint {
  return (
    !!value
    && typeof value === 'object'
    && typeof (value as Partial<WhiteboardSketchPoint>).x === 'number'
    && typeof (value as Partial<WhiteboardSketchPoint>).y === 'number'
  );
}

/**
 * Strip non-serializable sketch data without flipping eraser strokes into ink.
 * `drawMode: false` is falsy, so `drawMode || true` would destroy erasures on save.
 */
export function sanitizeWhiteboardPaths(value: unknown): WhiteboardSketchPath[] {
  if (!Array.isArray(value)) {
    throw new Error('Whiteboard canvas data must be a path array');
  }

  const sanitized = value.map((path): WhiteboardSketchPath => {
    if (typeof path !== 'object' || path === null) {
      return {
        drawMode: true,
        strokeColor: '#2563eb',
        strokeWidth: 2,
        paths: [],
      };
    }

    const pathRecord = path as {
      drawMode?: unknown;
      strokeColor?: unknown;
      strokeWidth?: unknown;
      paths?: unknown;
      path?: unknown;
    };
    const rawPoints = Array.isArray(pathRecord.paths)
      ? pathRecord.paths
      : (Array.isArray(pathRecord.path) ? pathRecord.path : []);

    return {
      drawMode: typeof pathRecord.drawMode === 'boolean' ? pathRecord.drawMode : true,
      strokeColor: typeof pathRecord.strokeColor === 'string' ? pathRecord.strokeColor : '#2563eb',
      strokeWidth: typeof pathRecord.strokeWidth === 'number' ? pathRecord.strokeWidth : 2,
      paths: rawPoints.filter(isSketchPoint),
    };
  });

  JSON.stringify(sanitized);
  return sanitized;
}
