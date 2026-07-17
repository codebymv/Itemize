import React from 'react';
import { describe, expect, it } from 'vitest';
import { normalizeToastContent } from './toast-content';

describe('normalizeToastContent', () => {
  it('turns structured API errors into renderable text', () => {
    expect(normalizeToastContent({
      message: 'A contact identifier is required',
      code: 'BAD_USER_INPUT',
      details: { field: 'email' },
    })).toBe('A contact identifier is required');
  });

  it('preserves valid React content', () => {
    const content = <span>Retry contact</span>;
    expect(normalizeToastContent(content)).toBe(content);
  });

  it('does not render arbitrary objects', () => {
    expect(normalizeToastContent({ code: 'UNKNOWN', details: { field: 'email' } }))
      .toBe('Something went wrong. Please try again.');
  });
});
