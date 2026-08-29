import { describe, expect, it } from 'vitest';
import { getSignatureStatusVisual, getTemplateReadinessVisual } from './signatureConstants';

describe('signature visual semantics', () => {
  it.each([
    ['draft', 'blue'],
    ['sent', 'orange'],
    ['in_progress', 'orange'],
    ['completed', 'green'],
    ['cancelled', 'red'],
    ['expired', 'red'],
  ] as const)('maps %s to the %s family', (status, theme) => {
    expect(getSignatureStatusVisual(status).theme).toBe(theme);
  });

  it('uses the failure icon for both invalid terminal states', () => {
    expect(getSignatureStatusVisual('expired').icon)
      .toBe(getSignatureStatusVisual('cancelled').icon);
    expect(getSignatureStatusVisual('expired').icon)
      .not.toBe(getSignatureStatusVisual('in_progress').icon);
  });

  it('uses outcome colors for template readiness', () => {
    expect(getTemplateReadinessVisual(true).theme).toBe('green');
    expect(getTemplateReadinessVisual(false).theme).toBe('orange');
  });
});
