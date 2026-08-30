import { zonedDateTimeToIso } from '@/lib/zonedDateTime';

/** Converts a wall-clock campaign time in the selected IANA zone to an ISO instant. */
export function campaignScheduleToIso(dateValue: string, timeValue: string, timeZone: string): string {
  try {
    return zonedDateTimeToIso(dateValue, timeValue || '09:00', timeZone);
  } catch (error) {
    if ((error as Error).message === 'Choose a valid date and time.') {
      throw new Error('Choose a valid campaign date and time.');
    }
    throw error;
  }
}
