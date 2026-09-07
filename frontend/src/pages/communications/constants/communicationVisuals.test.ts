import { describe, expect, it } from 'vitest';
import {
  getCommunicationAvailabilityVisual,
  getCommunicationConversationStatusVisual,
} from './communicationVisuals';

describe('communication status visuals', () => {
  it('keeps active work blue and successful conversation closure green', () => {
    expect(getCommunicationAvailabilityVisual(true)).toMatchObject({ label: 'Active', theme: 'theme' });
    expect(getCommunicationConversationStatusVisual('open')).toMatchObject({ label: 'Open', theme: 'theme' });
    expect(getCommunicationConversationStatusVisual('closed')).toMatchObject({ label: 'Closed', theme: 'green' });
  });

  it('treats inactive availability as parked and preserves unknown labels', () => {
    expect(getCommunicationAvailabilityVisual(false)).toMatchObject({ label: 'Inactive', theme: 'orange' });
    expect(getCommunicationConversationStatusVisual('awaiting_reply')).toMatchObject({
      label: 'Awaiting Reply',
      theme: 'gray',
    });
  });
});
