import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphqlRequestError } from './graphqlClient';
import {
  reconcileWorkspaceUpdate,
  resetWorkspaceCreationAttemptsForTests,
  runWorkspaceCreationAttempt,
  workspaceRecordMatchesUpdate,
} from './workspaceMutationReconciliation';

describe('workspace mutation reconciliation', () => {
  beforeEach(() => {
    resetWorkspaceCreationAttemptsForTests();
  });

  it('matches structured values independently of JSON key order', () => {
    expect(workspaceRecordMatchesUpdate(
      { flow_data: { edges: [], nodes: [] }, title: 'Flow' },
      { flow_data: '{"nodes":[],"edges":[]}', title: 'Flow' },
    )).toBe(true);
  });

  it('returns the authoritative record when an ambiguous write matches', async () => {
    const current = { id: 4, title: 'Confirmed' };
    await expect(reconcileWorkspaceUpdate(
      new TypeError('connection lost'),
      async () => current,
      { title: 'Confirmed' },
    )).resolves.toBe(current);
  });

  it('preserves deterministic and mismatched failures', async () => {
    const readCurrent = vi.fn().mockResolvedValue({ id: 4, title: 'Other' });
    const rejected = new GraphqlRequestError(
      'Invalid title',
      200,
      'BAD_USER_INPUT',
    );
    await expect(reconcileWorkspaceUpdate(
      rejected,
      readCurrent,
      { title: 'Confirmed' },
    )).rejects.toBe(rejected);
    expect(readCurrent).not.toHaveBeenCalled();

    const lost = new TypeError('connection lost');
    await expect(reconcileWorkspaceUpdate(
      lost,
      readCurrent,
      { title: 'Confirmed' },
    )).rejects.toBe(lost);
  });

  it('retains one creation key across an ambiguous retry', async () => {
    const keys: string[] = [];
    const create = vi.fn(async (key: string) => {
      keys.push(key);
      if (keys.length === 1) throw new TypeError('connection lost');
      return { id: 9, title: 'Recovered' };
    });

    await expect(runWorkspaceCreationAttempt(
      'note',
      { title: 'Recovered' },
      create,
    )).rejects.toThrow('connection lost');
    await expect(runWorkspaceCreationAttempt(
      'note',
      { title: 'Recovered' },
      create,
    )).resolves.toMatchObject({ id: 9 });
    expect(keys[0]).toBe(keys[1]);
  });

  it('single-flights concurrent creation transport', async () => {
    let resolveCreate: (value: { id: number }) => void = () => undefined;
    const create = vi.fn(() => new Promise<{ id: number }>((resolve) => {
      resolveCreate = resolve;
    }));
    const first = runWorkspaceCreationAttempt('list', { title: 'Tasks' }, create);
    const second = runWorkspaceCreationAttempt('list', { title: 'Tasks' }, create);
    resolveCreate({ id: 4 });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: 4 },
      { id: 4 },
    ]);
    expect(create).toHaveBeenCalledOnce();
  });
});
