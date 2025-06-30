import api from '../lib/api';

export interface DocStructure {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: DocStructure[];
}

const GETTING_STARTED_CONTENT = `
# Getting Started with Itemize.cloud

## Overview

Itemize.cloud is a comprehensive productivity platform that helps you organize your thoughts, tasks, and ideas through lists, notes, and whiteboards. The platform provides a seamless experience across devices with real-time synchronization and collaboration features.

## Prerequisites

Before you begin, make sure you have the following installed:
- Node.js (v18 or higher)
- npm or yarn
- PostgreSQL
- Git

## Quick Start

### 1. Clone the Repository

\`\`\`bash
git clone https://github.com/your-repo/itemize-cloud.git
cd itemize-cloud
\`\`\`

### 2. Install Dependencies

\`\`\`bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
\`\`\`

### 3. Environment Setup

Create environment files in both frontend and backend directories:

**Backend (.env)**:
\`\`\`env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://username:password@localhost:5432/itemize_db
JWT_SECRET=your_jwt_secret_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
\`\`\`

**Frontend (.env)**:
\`\`\`env
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=your_google_client_id
\`\`\`

### 4. Database Setup

\`\`\`bash
# Run database migrations
cd backend
npm run migrate
\`\`\`

### 5. Run the Application

**Development Mode:**

Terminal 1 - Backend:
\`\`\`bash
cd backend
npm run dev
\`\`\`

Terminal 2 - Frontend:
\`\`\`bash
cd frontend
npm run dev
\`\`\`

### 6. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

## Key Features

### Lists
- Create and manage task lists
- Add, edit, and complete items
- Organize with categories and colors
- Share lists publicly

### Notes
- Rich text editing with markdown support
- Organize notes with categories
- Search and filter capabilities
- Share notes publicly

### Whiteboards
- Infinite canvas for visual thinking
- Drawing tools and shapes
- Collaborative editing
- Export and sharing options

## Next Steps

1. **Read the API Documentation**: Start with [API Overview](./API/api-overview.md)
2. **Explore Features**: Check [Implementations](./Implementations/) for detailed guides
3. **Configuration**: Review [Config Documentation](./Config/) for advanced setup
4. **Security**: See [Security Documentation](./Security/) before production deployment

## Support

- **Issues**: File issues on GitHub repository
- **Documentation**: All docs are in the \`!docs/\` directory
- **API Reference**: Available at \`/api/docs\` when running the backend

For detailed information about specific components, see the respective documentation sections in the \`!docs/\` directory.
`;

class DocsService {
  async getDocContent(path: string): Promise<string> {
    try {
      const response = await api.get(`/docs/content?path=${encodeURIComponent(path)}`);
      return response.data.content;
    } catch (error) {
      console.error('Error fetching doc content for path:', path, error);
      if (path === 'getting-started' || path === '' || path === '/') {
        return GETTING_STARTED_CONTENT + 
               '\n\n---\n*This is fallback content. The actual content could not be loaded.*';
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

  generateFolderContent(path: string): string {
    const structure = this.getStaticStructure();
    const folder = this.findFolderByPath(structure, path);

    if (!folder || folder.type !== 'folder') {
      return this.getFallbackContent(path);
    }

    const folderName = folder.name;
    let content = `# ${folderName}\n\n`;

    // Add breadcrumb navigation for nested folders
    const pathSegments = path.split('/');
    if (pathSegments.length > 1) {
      pathSegments.forEach((segment, index) => {
        // Capitalize the segment name properly
        const capitalizedSegment = segment.charAt(0).toUpperCase() + segment.slice(1);

        if (index === 0) {
          content += `[${capitalizedSegment}](/help/${segment})`;
        } else {
          const segmentPath = pathSegments.slice(0, index + 1).join('/');
          content += ` > [${capitalizedSegment}](/help/${segmentPath})`;
        }
      });
      content += `\n\n`;
    }

    // Add context-aware descriptions
    const description = this.getFolderDescription(path, folderName);
    content += `${description}\n\n`;

    if (folder.children && folder.children.length > 0) {
      content += `## Contents\n\n`;
      
      // Separate folders and files
      const folders = folder.children.filter(child => child.type === 'folder');
      const files = folder.children.filter(child => child.type === 'file');

      // Add folders first
      if (folders.length > 0) {
        content += `### 📁 Folders\n\n`;
        folders.forEach(child => {
          content += `- **[${child.name}](/help/${child.path})** - `;
          content += `${child.children?.length || 0} item${(child.children?.length || 0) !== 1 ? 's' : ''}\n`;
        });
        content += `\n`;
      }

      // Add files
      if (files.length > 0) {
        content += `### 📄 Documentation Files\n\n`;
        files.forEach(child => {
          content += `- **[${child.name}](/help/${child.path})**\n`;
        });
        content += `\n`;
      }

      // Add quick navigation
      content += `## Quick Navigation\n\n`;
      content += `| Name | Type | Path |\n`;
      content += `|------|------|------|\n`;
      folder.children.forEach(child => {
        const icon = child.type === 'folder' ? '📁' : '📄';
        content += `| ${icon} [${child.name}](/help/${child.path}) | ${child.type} | \`${child.path}\` |\n`;
      });

    } else {
      content += `*This folder is currently empty or has no documented items.*\n\n`;
    }

    content += `\n---\n\n`;
    content += `💡 **Tip**: Use the sidebar navigation or search above to quickly find specific documentation.\n\n`;
    content += `[🏠 Back to Documentation Home](/help)`;

    return content;
  }

  private findFolderByPath(structure: DocStructure[], path: string): DocStructure | null {
    for (const item of structure) {
      if (item.path === path) {
        return item;
      }
      if (item.children) {
        const found = this.findFolderByPath(item.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  private getFallbackContent(path: string): string {
    const fileName = path.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Documentation';
    return `# ${fileName}\n\n## Content Not Available\n\nThe content for \`${path}\` could not be loaded. Please check the API or try again later.\n\n---\n*This is fallback content.*`;
  }

  private getStaticStructure(): DocStructure[] {
    return [
      {
        name: 'Getting Started',
        path: 'getting-started',
        type: 'file'
      },
      {
        name: 'API',
        path: 'API',
        type: 'folder',
        children: [
          { name: 'API Overview', path: 'API/api-overview', type: 'file' },
          { name: 'API Structure', path: 'API/api-structure', type: 'file' },
          { name: 'Authentication', path: 'API/authentication', type: 'file' },
          { name: 'CORS Configuration', path: 'API/cors-configuration', type: 'file' },
          {
            name: 'Endpoints',
            path: 'API/endpoints',
            type: 'folder',
            children: [
              { name: 'AI Suggestions', path: 'API/endpoints/ai-suggestions', type: 'file' },
              { name: 'Categories', path: 'API/endpoints/categories', type: 'file' },
              { name: 'Items', path: 'API/endpoints/items', type: 'file' },
              { name: 'Lists', path: 'API/endpoints/lists', type: 'file' },
              { name: 'Notes', path: 'API/endpoints/notes', type: 'file' },
              { name: 'Whiteboards', path: 'API/endpoints/whiteboards', type: 'file' },
            ]
          },
        ]
      },
      {
        name: 'Config',
        path: 'Config',
        type: 'folder',
        children: [
          { name: 'Backend Config', path: 'Config/backend-config', type: 'file' },
          { name: 'Frontend Config', path: 'Config/frontend-config', type: 'file' },
        ]
      },
      {
        name: 'Data',
        path: 'Data',
        type: 'folder',
        children: [
          { name: 'Categories PostgreSQL', path: 'Data/categories-postgres', type: 'file' },
          { name: 'Lists PostgreSQL', path: 'Data/lists-postgres', type: 'file' },
          { name: 'Notes PostgreSQL', path: 'Data/notes-postgres', type: 'file' },
          { name: 'Users PostgreSQL', path: 'Data/users-postgres', type: 'file' },
          { name: 'Whiteboards PostgreSQL', path: 'Data/whiteboards-postgres', type: 'file' },
        ]
      },
      {
        name: 'Dependencies',
        path: 'Dependencies',
        type: 'folder',
        children: [
          { name: 'Dependencies Overview', path: 'Dependencies/dependencies-overview', type: 'file' },
        ]
      },
      {
        name: 'Deploy',
        path: 'Deploy',
        type: 'folder',
        children: [
          { name: 'Deployment Overview', path: 'Deploy/deployment-overview', type: 'file' },
        ]
      },
      {
        name: 'Implementations',
        path: 'Implementations',
        type: 'folder',
        children: [
          {
            name: 'Caching',
            path: 'Implementations/Caching',
            type: 'folder',
            children: [
              { name: 'Caching Overview', path: 'Implementations/Caching/caching-overview', type: 'file' },
            ]
          },
          {
            name: 'Categories',
            path: 'Implementations/Categories',
            type: 'folder',
            children: [
              { name: 'Categories Overview', path: 'Implementations/Categories/categories-overview', type: 'file' },
            ]
          },
          {
            name: 'Gemini',
            path: 'Implementations/Gemini',
            type: 'folder',
            children: [
              { name: 'Gemini Overview', path: 'Implementations/Gemini/gemini-overview', type: 'file' },
            ]
          },
          {
            name: 'Infinite Canvas',
            path: 'Implementations/InfiniteCanvas',
            type: 'folder',
            children: [
              { name: 'Infinite Canvas Overview', path: 'Implementations/InfiniteCanvas/infinite-canvas-overview', type: 'file' },
            ]
          },
          {
            name: 'Lists',
            path: 'Implementations/Lists',
            type: 'folder',
            children: [
              { name: 'Lists Overview', path: 'Implementations/Lists/lists-overview', type: 'file' },
            ]
          },
          {
            name: 'Loading',
            path: 'Implementations/Loading',
            type: 'folder',
            children: [
              { name: 'Loading Overview', path: 'Implementations/Loading/loading-overview', type: 'file' },
            ]
          },
          {
            name: 'Notes',
            path: 'Implementations/Notes',
            type: 'folder',
            children: [
              { name: 'Notes Overview', path: 'Implementations/Notes/notes-overview', type: 'file' },
            ]
          },
          {
            name: 'OAuth',
            path: 'Implementations/OAuth',
            type: 'folder',
            children: [
              { name: 'OAuth Overview', path: 'Implementations/OAuth/oauth-overview', type: 'file' },
            ]
          },
          {
            name: 'Sessions',
            path: 'Implementations/Sessions',
            type: 'folder',
            children: [
              { name: 'Sessions Overview', path: 'Implementations/Sessions/sessions-overview', type: 'file' },
            ]
          },
          {
            name: 'Toast',
            path: 'Implementations/Toast',
            type: 'folder',
            children: [
              { name: 'Toast Overview', path: 'Implementations/Toast/toast-overview', type: 'file' },
            ]
          },
          {
            name: 'Whiteboards',
            path: 'Implementations/Whiteboards',
            type: 'folder',
            children: [
              { name: 'Whiteboards Overview', path: 'Implementations/Whiteboards/whiteboards-overview', type: 'file' },
            ]
          },
        ]
      },
      {
        name: 'Security',
        path: 'Security',
        type: 'folder',
        children: [
          { name: 'Content Security Policy', path: 'Security/content-security-policy', type: 'file' },
          { name: 'Platform Security', path: 'Security/platform-security', type: 'file' },
          { name: 'Preproduction Checklist', path: 'Security/preproduction-checklist', type: 'file' },
          { name: 'Rate Limiting', path: 'Security/rate-limiting', type: 'file' },
          { name: 'Security Overview', path: 'Security/security-overview', type: 'file' },
        ]
      },
      {
        name: 'Sitemap',
        path: 'Sitemap',
        type: 'folder',
        children: [
          { name: 'Architecture Overview', path: 'Sitemap/architecture-overview', type: 'file' },
          { name: 'Routing and Layouts', path: 'Sitemap/routing-and-layouts', type: 'file' },
          { name: 'Sitemap Overview', path: 'Sitemap/sitemap-overview', type: 'file' },
        ]
      },
      {
        name: 'Stack',
        path: 'Stack',
        type: 'folder',
        children: [
          { name: 'Stack Overview', path: 'Stack/stack-overview', type: 'file' },
        ]
      },
      {
        name: 'Tests',
        path: 'Tests',
        type: 'folder',
        children: [
          {
            name: 'Backend',
            path: 'Tests/Backend',
            type: 'folder',
            children: [
              // Backend test files will be populated when they exist
            ]
          },
          {
            name: 'Frontend',
            path: 'Tests/Frontend',
            type: 'folder',
            children: [
              // Frontend test files will be populated when they exist
            ]
          },
        ]
      },
      {
        name: 'Version',
        path: 'Version',
        type: 'folder',
        children: [
          { name: '0.8.2 Overview', path: 'Version/0.8.2-overview', type: 'file' },
        ]
      }
    ];
  }

  private getFolderDescription(path: string, folderName: string): string {
    const descriptions: Record<string, string> = {
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
