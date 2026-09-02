import { calendarCreationFingerprint } from './calendar-creation.idempotency';

describe('calendarCreationFingerprint', () => {
  it('canonicalizes nested settings and availability key order', () => {
    expect(
      calendarCreationFingerprint({
        name: 'Consultation',
        availabilityWindows: [{ dayOfWeek: 1, isActive: true }],
      }),
    ).toBe(
      calendarCreationFingerprint({
        availabilityWindows: [{ isActive: true, dayOfWeek: 1 }],
        name: 'Consultation',
      }),
    );
  });

  it('separates materially different creation intent', () => {
    expect(calendarCreationFingerprint({ durationMinutes: 30 })).not.toBe(
      calendarCreationFingerprint({ durationMinutes: 45 }),
    );
  });
});
