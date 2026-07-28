import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateSegment,
  createSegment,
  deleteSegment,
  getFilterOptions,
  getSegment,
  getSegmentContacts,
  getSegments,
  previewSegment,
  updateSegment,
} from './segmentsApi';
import {
  createSegmentViaGraphql,
  deleteSegmentViaGraphql,
  getSegmentContactsViaGraphql,
  getSegmentFilterOptionsViaGraphql,
  getSegmentViaGraphql,
  getSegmentsViaGraphql,
  previewSegmentViaGraphql,
  recalculateSegmentViaGraphql,
  updateSegmentViaGraphql,
} from './segmentsGraphql';

vi.mock('./segmentsGraphql', () => ({
  createSegmentViaGraphql: vi.fn(),
  deleteSegmentViaGraphql: vi.fn(),
  getSegmentContactsViaGraphql: vi.fn(),
  getSegmentFilterOptionsViaGraphql: vi.fn(),
  getSegmentViaGraphql: vi.fn(),
  getSegmentsViaGraphql: vi.fn(),
  previewSegmentViaGraphql: vi.fn(),
  recalculateSegmentViaGraphql: vi.fn(),
  updateSegmentViaGraphql: vi.fn(),
}));

describe('segments API permanent GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSegmentsViaGraphql).mockResolvedValue([]);
    vi.mocked(getSegmentViaGraphql).mockResolvedValue({} as never);
    vi.mocked(createSegmentViaGraphql).mockResolvedValue({} as never);
    vi.mocked(updateSegmentViaGraphql).mockResolvedValue({} as never);
    vi.mocked(deleteSegmentViaGraphql).mockResolvedValue({ success: true });
    vi.mocked(recalculateSegmentViaGraphql).mockResolvedValue({} as never);
    vi.mocked(getSegmentContactsViaGraphql).mockResolvedValue({
      contacts: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    });
    vi.mocked(previewSegmentViaGraphql).mockResolvedValue({ count: 0, sample: [] });
    vi.mocked(getSegmentFilterOptionsViaGraphql).mockResolvedValue({
      fields: [], tags: [], users: [], pipelines: [],
    });
  });

  it('delegates all nine operations without a REST fallback', async () => {
    const filters = [{ field: 'status', operator: 'equals', value: 'active' }];
    const input = { name: 'Active contacts' };

    await getSegments({ is_active: true }, 3);
    await getSegment(7, 3);
    await createSegment(input, 3);
    await updateSegment(7, input, 3);
    await deleteSegment(7, 3);
    await calculateSegment(7, 3);
    await getSegmentContacts(7, { page: 2, limit: 25 }, 3);
    await previewSegment(filters, 'or', 3);
    await getFilterOptions(3);

    expect(getSegmentsViaGraphql).toHaveBeenCalledWith({ is_active: true }, 3);
    expect(getSegmentViaGraphql).toHaveBeenCalledWith(7, 3);
    expect(createSegmentViaGraphql).toHaveBeenCalledWith(input, 3);
    expect(updateSegmentViaGraphql).toHaveBeenCalledWith(7, input, 3);
    expect(deleteSegmentViaGraphql).toHaveBeenCalledWith(7, 3);
    expect(recalculateSegmentViaGraphql).toHaveBeenCalledWith(7, 3);
    expect(getSegmentContactsViaGraphql).toHaveBeenCalledWith(7, { page: 2, limit: 25 }, 3);
    expect(previewSegmentViaGraphql).toHaveBeenCalledWith(filters, 'or', 3);
    expect(getSegmentFilterOptionsViaGraphql).toHaveBeenCalledWith(3);
  });
});
