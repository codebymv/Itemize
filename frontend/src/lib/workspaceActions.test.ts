import { describe, expect, it } from 'vitest';
import {
  ESTIMATE_PREFILL_STATE,
  WORKSPACE_ACTIONS,
  actionSuggestions,
  estimatePrefillFromList,
  readEstimatePrefill,
  triggerForAction,
} from './workspaceActions';
import type { List } from '@/types';

const all = WORKSPACE_ACTIONS.map((action) => action.id);

describe('workspaceActions', () => {
  it('lists the available actions in vocabulary order for an empty query', () => {
    expect(actionSuggestions(all, '').map((row) => row.action)).toEqual(all);
    expect(actionSuggestions(['share', 'new-list'], '').map((row) => row.action)).toEqual(['new-list', 'share']);
    expect(actionSuggestions(all, 'arch').map((row) => row.action)).toEqual(['archive']);
    expect(actionSuggestions([], '')).toEqual([]);
  });

  it('matches a query as a prefix of any label word or keyword', () => {
    expect(actionSuggestions(all, 'est').map((row) => row.action)).toEqual(['turn-into-estimate', 'reference-document']);
    expect(actionSuggestions(all, 'turn').map((row) => row.action)).toEqual(['turn-into-estimate']);
    expect(actionSuggestions(all, 'SHA').map((row) => row.action)).toEqual(['share']);
    expect(actionSuggestions(all, 'inv').map((row) => row.action)).toEqual(['reference-document']);
    expect(actionSuggestions(all, 'fra').map((row) => row.action)).toEqual(['move-to-frame']);
    expect(actionSuggestions(all, 'new-li').map((row) => row.action)).toEqual(['new-list']);
    expect(actionSuggestions(all, 'usr/bin')).toEqual([]);
  });

  it('shapes rows as action suggestions with stable ids', () => {
    expect(actionSuggestions(all, 'share')).toEqual([
      { kind: 'action', id: 3, label: 'Share', detail: 'Public link for this card', initials: '/', action: 'share' },
    ]);
  });

  it('maps the door actions to their sigils', () => {
    expect(triggerForAction('mention-client')).toBe('@');
    expect(triggerForAction('reference-document')).toBe('$');
    expect(triggerForAction('move-to-frame')).toBe('#');
    expect(triggerForAction('share')).toBeNull();
  });

  it('turns a list into line items without ids, tokens, or blanks', () => {
    const list: List = {
      id: 7,
      title: 'Kitchen scope',
      type: 'General',
      items: [
        { id: 'a', text: 'Demo old cabinets', completed: true },
        { id: 'b', text: '  ', completed: false },
        { id: 'c', text: 'Tile per $[INV-0012](invoice:4)  with @[Casey Sanchez](contact:12)', completed: false },
      ],
    };
    expect(estimatePrefillFromList(list)).toEqual({
      source: { type: 'list', id: '7', title: 'Kitchen scope' },
      lineItems: [
        { name: 'Demo old cabinets' },
        { name: 'Tile per $INV-0012 with @Casey Sanchez' },
      ],
    });
  });

  it('reads only a well-formed prefill back out of router state', () => {
    const prefill = estimatePrefillFromList({
      id: 7,
      title: 'Kitchen scope',
      type: 'General',
      items: [{ id: 'a', text: 'Demo', completed: false }],
    });
    expect(readEstimatePrefill({ [ESTIMATE_PREFILL_STATE]: prefill })).toEqual(prefill);
    // Router state may carry the numeric id; it is normalised to the string the prefill uses.
    expect(readEstimatePrefill({ [ESTIMATE_PREFILL_STATE]: { ...prefill, source: { ...prefill.source, id: 7 } } }))
      .toEqual({ ...prefill, source: { ...prefill.source, id: '7' } });
    expect(estimatePrefillFromList({ id: 9, title: 'n', type: 'General', items: [] }).source.id).toBe('9');
    expect(readEstimatePrefill(null)).toBeNull();
    expect(readEstimatePrefill({})).toBeNull();
    expect(readEstimatePrefill({ [ESTIMATE_PREFILL_STATE]: { source: { type: 'note', id: '1', title: 'x' }, lineItems: [] } })).toBeNull();
    expect(readEstimatePrefill({
      [ESTIMATE_PREFILL_STATE]: {
        source: { type: 'list', id: '7', title: 'Kitchen scope' },
        lineItems: [{ name: ' Demo ' }, { name: 4 }, 'junk', { name: '' }],
      },
    })).toEqual({
      source: { type: 'list', id: '7', title: 'Kitchen scope' },
      lineItems: [{ name: 'Demo' }],
    });
  });
});
