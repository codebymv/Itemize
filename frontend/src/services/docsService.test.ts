import { describe, expect, it } from 'vitest';
import {
  DEVELOPERS_FOLDER_PATH,
  groupHelpStructure,
  parentPaths,
} from './docsService';

describe('help docs tree helpers', () => {
  it('groups the help folder as Guides and the rest as Developers', () => {
    const grouped = groupHelpStructure([
      {
        name: 'Help',
        path: 'help',
        type: 'folder',
        children: [{ name: 'Workspace', path: 'help/workspace', type: 'file' }],
      },
      { name: 'API', path: 'API', type: 'folder', children: [] },
    ]);
    expect(grouped).toEqual([
      {
        name: 'Guides',
        path: 'help',
        type: 'folder',
        children: [{ name: 'Workspace', path: 'help/workspace', type: 'file' }],
      },
      {
        name: 'Developers',
        path: DEVELOPERS_FOLDER_PATH,
        type: 'folder',
        children: [{ name: 'API', path: 'API', type: 'folder', children: [] }],
      },
    ]);
  });

  it('opens ancestor folders and Developers for API paths', () => {
    expect(parentPaths('help/workspace')).toEqual(['help']);
    expect(parentPaths('API/contracts/invoices-graphql-cutover')).toEqual([
      'API',
      'API/contracts',
      DEVELOPERS_FOLDER_PATH,
    ]);
  });
});
