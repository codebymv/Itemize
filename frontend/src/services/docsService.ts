import api from '../lib/api';

export interface DocStructure {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: DocStructure[];
}

export const DEVELOPERS_FOLDER_PATH = '__developers';
export const GETTING_STARTED_PATH = '!getting-started';

const HELP_FALLBACK = `
# Getting Started with Itemize

Itemize is a workspace for organizing work, invoicing clients, and collecting signatures — without stacking extra tools.

## Guides

- [Workspace](/help/!workspace)
- [Invoices](/help/!invoices)
- [Signatures](/help/!signatures)
- [Billing](/help/!billing)
- [Sharing](/help/!sharing)
`;

export function formatDocName(name: string): string {
  return name
    .replace(/^!+/, '')
    .replace(/^\$+/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPinnedHelpFile(item: DocStructure): boolean {
  return item.type === 'file' && item.path.startsWith('!');
}

export function parentPaths(path: string): string[] {
  const segments = path.split('/').filter(Boolean);
  const paths: string[] = [];
  let current = '';
  for (let i = 0; i < segments.length - 1; i += 1) {
    current = current ? `${current}/${segments[i]}` : segments[i];
    paths.push(current);
  }
  if (segments[0] && !segments[0].startsWith('!')) {
    paths.push(DEVELOPERS_FOLDER_PATH);
  }
  return paths;
}

export function groupHelpStructure(items: DocStructure[]): DocStructure[] {
  const pinned = items.filter(isPinnedHelpFile);
  const rest = items.filter((item) => !isPinnedHelpFile(item));
  const grouped: DocStructure[] = [...pinned];
  if (rest.length > 0) {
    grouped.push({
      name: 'Developers',
      path: DEVELOPERS_FOLDER_PATH,
      type: 'folder',
      children: rest,
    });
  }
  return grouped;
}

export function findItemByPath(items: DocStructure[], path: string): DocStructure | null {
  for (const item of items) {
    if (item.path === path) return item;
    if (item.children) {
      const found = findItemByPath(item.children, path);
      if (found) return found;
    }
  }
  return null;
}

class DocsService {
  async getDocContent(path: string): Promise<string> {
    try {
      const response = await api.get(`/docs/content?path=${encodeURIComponent(path)}`);
      return response.data.content;
    } catch (error) {
      console.error('Error fetching doc content for path:', path, error);
      if (path === GETTING_STARTED_PATH || path === 'getting-started' || path === '' || path === '/') {
        return HELP_FALLBACK;
      }
      return this.getFallbackContent(path);
    }
  }

  async getDocStructure(): Promise<DocStructure[]> {
    try {
      const response = await api.get(`/docs/structure`);
      return response.data;
    } catch (error) {
      console.error('Error fetching doc structure:', error);
      return this.getStaticStructure();
    }
  }

  async searchDocs(query: string): Promise<DocStructure[]> {
    try {
      const response = await api.get(`/docs/search?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error('Error searching docs:', error);
      return [];
    }
  }

  generateFolderContent(path: string, structure: DocStructure[]): string {
    const folder = findItemByPath(structure, path);

    if (!folder || folder.type !== 'folder') {
      return this.getFallbackContent(path);
    }

    const folderName = formatDocName(folder.name);
    let content = `# ${folderName}\n\n`;

    const pathSegments = path.split('/').filter((segment) => segment !== DEVELOPERS_FOLDER_PATH);
    if (pathSegments.length > 1) {
      pathSegments.forEach((segment, index) => {
        const capitalizedSegment = formatDocName(segment);
        if (index === 0) {
          content += `[${capitalizedSegment}](/help/${segment})`;
        } else {
          const segmentPath = pathSegments.slice(0, index + 1).join('/');
          content += ` > [${capitalizedSegment}](/help/${segmentPath})`;
        }
      });
      content += `\n\n`;
    }

    const description = this.getFolderDescription(path, folderName);
    content += `${description}\n\n`;

    if (folder.children && folder.children.length > 0) {
      content += `## Contents\n\n`;

      const folders = folder.children.filter(child => child.type === 'folder');
      const files = folder.children.filter(child => child.type === 'file');

      if (folders.length > 0) {
        content += `### Folders\n\n`;
        folders.forEach(child => {
          const href = child.path === DEVELOPERS_FOLDER_PATH ? '#' : `/help/${child.path}`;
          content += `- **[${formatDocName(child.name)}](${href})** - `;
          content += `${child.children?.length || 0} item${(child.children?.length || 0) !== 1 ? 's' : ''}\n`;
        });
        content += `\n`;
      }

      if (files.length > 0) {
        content += `### Guides\n\n`;
        files.forEach(child => {
          content += `- **[${formatDocName(child.name)}](/help/${child.path})**\n`;
        });
        content += `\n`;
      }
    } else {
      content += `*This folder is currently empty.*\n\n`;
    }

    content += `\n---\n\n`;
    content += `[Back to Help](/help/${GETTING_STARTED_PATH})`;

    return content;
  }

  private getFallbackContent(path: string): string {
    const fileName = formatDocName(path.split('/').pop() || 'Help');
    return `# ${fileName}\n\nThe content for \`${path}\` could not be loaded. Try [Help home](/help/${GETTING_STARTED_PATH}).\n`;
  }

  private getStaticStructure(): DocStructure[] {
    return [
      { name: 'Getting Started', path: GETTING_STARTED_PATH, type: 'file' },
      { name: 'Workspace', path: '!workspace', type: 'file' },
      { name: 'Invoices', path: '!invoices', type: 'file' },
      { name: 'Signatures', path: '!signatures', type: 'file' },
      { name: 'Billing', path: '!billing', type: 'file' },
      { name: 'Sharing', path: '!sharing', type: 'file' },
      {
        name: 'API',
        path: 'API',
        type: 'folder',
        children: [
          { name: 'API Overview', path: 'API/api-overview', type: 'file' },
        ],
      },
    ];
  }

  private getFolderDescription(path: string, folderName: string): string {
    const descriptions: Record<string, string> = {
      'Developers': 'Internal API, configuration, and implementation notes.',
      'API': 'Complete API documentation including endpoints, authentication, and configuration.',
      'Config': 'Configuration files and environment setup guides for frontend and backend.',
      'Data': 'Database schemas, data structures, and PostgreSQL table definitions.',
      'Dependencies': 'Project dependencies and package management documentation.',
      'Deploy': 'Deployment guides and production setup instructions.',
      'Implementations': 'Detailed implementation guides for various features and integrations.',
      'Security': 'Security implementation details, policies, and best practices.',
      'Sitemap': 'Application structure, routing, and architectural overview.',
      'Stack': 'Technology stack overview and architectural decisions.',
      'Tests': 'Testing strategies, test suites, and quality assurance documentation.',
      'Version': 'Version history and release notes.',
      'Caching': 'Caching strategies and implementation details.',
      'Categories': 'Category system implementation and management.',
      'Gemini': 'Google Gemini AI integration for suggestions and enhancements.',
      'InfiniteCanvas': 'Infinite canvas implementation for whiteboards.',
      'Lists': 'List management system and functionality.',
      'Loading': 'Loading states and user experience patterns.',
      'Notes': 'Note-taking system and rich text editing.',
      'OAuth': 'OAuth authentication and Google integration.',
      'Sessions': 'Session management and user state handling.',
      'Toast': 'Toast notification system implementation.',
      'Whiteboards': 'Whiteboard functionality and drawing tools.',
      'Backend': 'Backend testing strategies and test suites.',
      'Frontend': 'Frontend testing approaches and component tests.',
    };

    return descriptions[folderName] || `Documentation for ${folderName} related topics and configurations.`;
  }
}

export const docsService = new DocsService();
