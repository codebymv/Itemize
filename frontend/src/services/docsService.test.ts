import { describe, expect, it } from 'vitest';
import {
  DEVELOPERS_FOLDER_PATH,
  formatDocName,
  groupHelpStructure,
  parentPaths,
} from './docsService';

describe('help docs tree helpers', () => {
  it('strips bang and dollar prefixes from display names', () => {
    expect(formatDocName('!getting-started')).toBe('Getting Started');
    expect(formatDocName('!$welcome')).toBe('Welcome');
  });

  it('pins bang-prefixed files above Developers', () => {
    const grouped = groupHelpStructure([
      { name: 'API', path: 'API', type: 'folder', children: [] },
      { name: 'Getting Started', path: '!getting-started', type: 'file' },
      { name: 'Workspace', path: '!workspace', type: 'file' },
    ]);
    expect(grouped).toEqual([
      { name: 'Getting Started', path: '!getting-started', type: 'file' },
      { name: 'Workspace', path: '!workspace', type: 'file' },
      {
        name: 'Developers',
        path: DEVELOPERS_FOLDER_PATH,
        type: 'folder',
        children: [{ name: 'API', path: 'API', type: 'folder', children: [] }],
      },
    ]);
  });

  it('opens ancestor folders and Developers for API paths', () => {
    expect(parentPaths('!workspace')).toEqual([]);
    expect(parentPaths('API/contracts/invoices-graphql-cutover')).toEqual([
      'API',
      'API/contracts',
      DEVELOPERS_FOLDER_PATH,
    ]);
  });
});
