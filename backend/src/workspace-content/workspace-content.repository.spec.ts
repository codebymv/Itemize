import type { Pool, PoolClient } from 'pg';
import { RealtimeOutboxService } from '../realtime-outbox/realtime-outbox.service';
import { WorkspaceContentRepository } from './workspace-content.repository';

describe('WorkspaceContentRepository canvas position revisions', () => {
  it('does not invalidate a wireframe content revision for a layout-only move', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE wireframes')) {
        return {
          rows: [{
            id: 12,
            position_x: 71,
            position_y: 80,
            width: null,
            height: null,
            share_token: null,
            is_public: false,
            occurred_at: new Date('2026-08-21T12:00:00.000Z'),
          }],
        };
      }
      return { rows: [] };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const realtime = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as RealtimeOutboxService;

    const repository = new WorkspaceContentRepository(pool, realtime);
    await repository.batchCanvasPositions(4, 'move-1', [{
      type: 'wireframe',
      id: 12,
      positionX: 70.6,
      positionY: 80.4,
      width: null,
      height: null,
    }]);

    const updateSql = query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('UPDATE wireframes'));
    expect(updateSql).toBeDefined();
    expect(updateSql).toContain('position_x = $1');
    expect(updateSql).not.toContain('updated_at =');
    expect(realtime.enqueue).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        aggregateType: 'wireframe',
        eventType: 'POSITION_UPDATE',
      }),
    );
  });
});
