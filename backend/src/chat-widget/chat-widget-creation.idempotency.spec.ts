import { chatWidgetCreationFingerprint } from './chat-widget-creation.idempotency';

describe('chatWidgetCreationFingerprint', () => {
  it('canonicalizes nested configuration objects', () => {
    expect(chatWidgetCreationFingerprint({
      name: 'Support', businessHours: { monday: { start: '09:00', end: '17:00' } },
    })).toBe(chatWidgetCreationFingerprint({
      businessHours: { monday: { end: '17:00', start: '09:00' } }, name: 'Support',
    }));
  });

  it('changes when normalized creation intent changes', () => {
    expect(chatWidgetCreationFingerprint({ name: 'Support', isActive: true }))
      .not.toBe(chatWidgetCreationFingerprint({ name: 'Support', isActive: false }));
  });

  it('treats domain allowlists as an unordered set', () => {
    expect(chatWidgetCreationFingerprint({ allowedDomains: ['b.test', 'a.test'] }))
      .toBe(chatWidgetCreationFingerprint({ allowedDomains: ['a.test', 'b.test'] }));
  });
});
