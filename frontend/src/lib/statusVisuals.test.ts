import { describe, expect, it } from 'vitest';
import { CheckCircle, Pause, Play, XCircle } from 'lucide-react';
import { defineStatus } from './statusVisuals';

describe('status visual semantics', () => {
  it.each([
    ['Active', 'blue', Play, 'bg-blue-100', 'text-blue-600'],
    ['Paused', 'orange', Pause, 'bg-orange-100', 'text-orange-600'],
    ['Completed', 'green', CheckCircle, 'bg-green-100', 'text-green-600'],
    ['Overdue', 'red', XCircle, 'bg-red-100', 'text-red-600'],
  ] as const)('maps %s to the shared %s treatment', (label, theme, icon, background, foreground) => {
    const visual = defineStatus(label, theme, icon);

    expect(visual.label).toBe(label);
    expect(visual.theme).toBe(theme);
    expect(visual.icon).toBe(icon);
    expect(visual.iconBackgroundClass).toContain(background);
    expect(visual.iconClass).toContain(foreground);
    expect(visual.badgeClass).toContain(background);
  });
});
