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

  it('replays a completed creation receipt without inserting twice', async () => {
    let completed = false;
    const created = {
      id: 44,
      user_id: 4,
      title: 'Plan',
      content: '',
      category: 'General',
      category_id: 2,
      color_value: '#3B82F6',
      position_x: 20,
      position_y: 30,
      width: 570,
      height: 350,
      z_index: 0,
      share_token: null,
      is_public: false,
      shared_at: null,
      created_at: new Date('2026-08-21T12:00:00.000Z'),
      updated_at: new Date('2026-08-21T12:00:00.000Z'),
    };
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT entity_type, request_fingerprint')) {
        return {
          rows: [{
            entity_type: 'note',
            request_fingerprint: 'a'.repeat(64),
            entity_id: completed ? 44 : null,
          }],
        };
      }
      if (sql.includes('FROM categories')) {
        return { rows: [{ id: 2, name: 'General' }] };
      }
      if (sql.includes('INSERT INTO notes')) return { rows: [created] };
      if (sql.includes('UPDATE workspace_creation_receipts')) {
        completed = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM notes WHERE id')) return { rows: [created] };
      return { rows: [], rowCount: 1 };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const repository = new WorkspaceContentRepository(
      pool,
      { enqueue: jest.fn() } as unknown as RealtimeOutboxService,
    );
    const values = {
      title: 'Plan',
      content: '',
      category: 'General',
      colorValue: '#3B82F6',
      positionX: 20,
      positionY: 30,
      width: 570,
      height: 350,
      zIndex: 0,
    };

    await expect(repository.createNote(
      4,
      values,
      'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
      'a'.repeat(64),
    )).resolves.toMatchObject({ kind: 'completed', row: { id: 44 } });
    await expect(repository.createNote(
      4,
      values,
      'e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
      'a'.repeat(64),
    )).resolves.toMatchObject({ kind: 'completed', row: { id: 44 } });
    expect(query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO notes'))).toHaveLength(1);
  });
});
