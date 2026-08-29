import { describe, expect, it } from 'vitest';
import { campaignScheduleToIso } from './campaignSchedule';

describe('campaignScheduleToIso', () => {
  it('honors the selected timezone rather than the browser timezone', () => {
    expect(campaignScheduleToIso('2026-08-28', '09:30', 'America/Phoenix')).toBe('2026-08-28T16:30:00.000Z');
    expect(campaignScheduleToIso('2026-08-28', '09:30', 'America/New_York')).toBe('2026-08-28T13:30:00.000Z');
  });

  it('accounts for daylight saving time', () => {
    expect(campaignScheduleToIso('2026-01-15', '09:00', 'America/New_York')).toBe('2026-01-15T14:00:00.000Z');
    expect(campaignScheduleToIso('2026-07-15', '09:00', 'America/New_York')).toBe('2026-07-15T13:00:00.000Z');
  });

  it('rejects a nonexistent daylight-saving wall time', () => {
    expect(() => campaignScheduleToIso('2026-03-08', '02:30', 'America/New_York')).toThrow(/does not exist/i);
  });
});
