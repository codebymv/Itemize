import { enqueueBookingNotification } from './booking-notification';

describe('booking organizer contact snapshot', () => {
  const base = { attendee_email: 'qa@example.com', contact_id: null, start_time: new Date('2026-09-16T18:00:00Z'), end_time: new Date('2026-09-16T18:30:00Z'), timezone: 'America/Phoenix', calendar_name: 'QA', organization_name: 'QA studio' };
  async function render(email: string | null) {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ ...base, organizer_email: email }] }).mockResolvedValueOnce({ rows: [] });
    await enqueueBookingNotification({ query } as any, 1, 2, 'confirmed', 'qa');
    return JSON.parse(query.mock.calls[1][1][2]);
  }
  it('snapshots an actionable configured contact into both alternatives', async () => {
    const payload = await render('appointments@example.com');
    expect(payload.bodyHtml).toContain('href="mailto:appointments@example.com"');
    expect(payload.bodyText).toContain('appointments@example.com');
    expect(payload.bodyHtml).toContain('America/Phoenix');
  });
  it.each([null, 'bad@example.com\r\nBcc: private@example.com', '<script>'])('does not publish invalid contact %s', async email => {
    const payload = await render(email);
    expect(payload.bodyHtml).not.toContain('mailto:');
    expect(payload.bodyHtml).toContain('contact details provided when arranging this appointment');
  });
});
