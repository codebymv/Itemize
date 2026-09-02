import { segmentCreationFingerprint } from './segment-creation.idempotency';
import type { SegmentValues } from './segments.repository';

const values: SegmentValues = {
  name: 'Priority', description: null, color: '#2563EB', icon: 'users',
  isActive: true,
  definition: {
    segment_type: 'static', filter_type: 'and', filters: [], static_contact_ids: [9, 4],
  },
};

describe('segmentCreationFingerprint', () => {
  it('canonicalizes object fields and static contact membership', () => {
    expect(segmentCreationFingerprint(values)).toBe(segmentCreationFingerprint({
      ...values,
      definition: { ...values.definition, static_contact_ids: [4, 9] },
    }));
  });

  it('changes with normalized segment intent', () => {
    expect(segmentCreationFingerprint(values)).not.toBe(
      segmentCreationFingerprint({ ...values, name: 'Customers' }),
    );
  });
});
