import { describe, expect, it } from 'vitest';
import {
  SENTIMENT_CLASSES,
  STATUS_BADGE_CLASSES,
  getSentimentBadgeClass,
  getStatusBadgeClass,
} from './badge-utils';
import { STATUS_THEME_CLASSES } from './statusVisuals';

const CONTRACT_BADGE_CLASSES = Object.values(STATUS_THEME_CLASSES).map(theme => theme.badgeClass);

describe('badge-utils', () => {
  it('resolves every status through the shared palette contract', () => {
    const values = Object.values(STATUS_BADGE_CLASSES);

    expect(values.length).toBeGreaterThan(0);
    values.forEach(value => {
      expect(CONTRACT_BADGE_CLASSES).toContain(value);
    });
  });

  it('reads unknown statuses as neutral rather than inventing a color', () => {
    expect(getStatusBadgeClass('not-a-real-status')).toBe(STATUS_THEME_CLASSES.gray.badgeClass);
    expect(getSentimentBadgeClass('unknown')).toBe(STATUS_THEME_CLASSES.gray.badgeClass);
  });

  it('keeps the documented status semantics', () => {
    expect(getStatusBadgeClass('paid')).toBe(STATUS_THEME_CLASSES.green.badgeClass);
    expect(getStatusBadgeClass('overdue')).toBe(STATUS_THEME_CLASSES.red.badgeClass);
    expect(getStatusBadgeClass('draft')).toBe(STATUS_THEME_CLASSES.blue.badgeClass);
    expect(getStatusBadgeClass('pending')).toBe(STATUS_THEME_CLASSES.orange.badgeClass);
    expect(getStatusBadgeClass('refunded')).toBe(STATUS_THEME_CLASSES.gray.badgeClass);
  });

  it('normalizes hyphenated and spaced status strings', () => {
    expect(getStatusBadgeClass('In Progress')).toBe(STATUS_THEME_CLASSES.orange.badgeClass);
    expect(getStatusBadgeClass('in-progress')).toBe(STATUS_THEME_CLASSES.orange.badgeClass);
  });

  it('keeps neutral sentiment on the transitional theme', () => {
    expect(SENTIMENT_CLASSES.neutral).toBe(STATUS_THEME_CLASSES.orange.badgeClass);
    expect(SENTIMENT_CLASSES.positive).toBe(STATUS_THEME_CLASSES.green.badgeClass);
    expect(SENTIMENT_CLASSES.negative).toBe(STATUS_THEME_CLASSES.red.badgeClass);
  });
});
