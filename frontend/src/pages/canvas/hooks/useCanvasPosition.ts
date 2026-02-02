import { List, Note, Whiteboard, Wireframe } from '@/types';
import { CANVAS_CENTER, BASE_SPREAD_RADIUS, MIN_DISTANCE, MAX_POSITION_ATTEMPTS, ITEM_WIDTH, ITEM_HEIGHT } from '../constants/canvasConstants';

export function getIntelligentPosition(existingItems: { position_x?: number; position_y?: number }[]): { x: number; y: number } {
  const centerX = CANVAS_CENTER.x;
  const centerY = CANVAS_CENTER.y;

  const existingPositions: Array<{ x: number; y: number }> = existingItems
    .map(item => ({ x: item.position_x || 0, y: item.position_y || 0 }))
    .filter(pos => pos.x !== 0 || pos.y !== 0);

  const hasOverlap = (newX: number, newY: number): boolean => {
    return existingPositions.some(pos => {
      const distanceX = Math.abs(newX - pos.x);
      const distanceY = Math.abs(newY - pos.y);
      return distanceX < (ITEM_WIDTH + MIN_DISTANCE) && distanceY < (ITEM_HEIGHT + MIN_DISTANCE);
    });
  };

  let attempts = 0;
  let position;

  do {
    const spreadRadius = BASE_SPREAD_RADIUS + (attempts * 50);
    const randomX = (Math.random() - 0.5) * spreadRadius * 2;
    const randomY = (Math.random() - 0.5) * spreadRadius * 2;

    position = {
      x: centerX + randomX,
      y: centerY + randomY
    };

    attempts++;
  } while (hasOverlap(position.x, position.y) && attempts < MAX_POSITION_ATTEMPTS);

  return position;
}

export function useCanvasPosition() {
  return { getIntelligentPosition };
}