/**
 * Documentation help-center API, ported from the legacy origin
 * (backend/src/routes/docs.js): markdown content reads with a
 * directory-containment guard, the recursive structure listing with
 * the !-first ordering, and content search with excerpts. Serves the
 * synced docs mirror (backend/docs) in deployments and the !docs
 * source when running inside the monorepo.
 */
import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { existsSync, statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

const SKIP_DIR_NAMES = new Set(['archive', 'generated']);

type DocEntry = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: DocEntry[];
  excerpt?: string | null;
  _rawName?: string;
};

const findDocsPath = (): string => {
  const candidates = [
    path.resolve(__dirname, '../../docs'),
    path.resolve(__dirname, '../../../docs'),
    path.resolve(__dirname, '../../../!docs'),
    path.resolve(process.cwd(), 'docs'),
    path.resolve(process.cwd(), '../!docs'),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // keep looking
    }
  }
  return candidates[0];
};

const shouldSkipEntry = (relativePath: string): boolean =>
  relativePath.split(/[\\/]/).some((segment) => SKIP_DIR_NAMES.has(segment));

const formatName = (name: string): string =>
  name
    .replace(/^!+/, '')
    .replace(/^\$+/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const extractExcerpt = (
  content: string,
  query: string,
  contextLength = 100,
): string | null => {
  const index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return null;
  const start = Math.max(0, index - contextLength);
  const end = Math.min(content.length, index + query.length + contextLength);
  let excerpt = content.substring(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < content.length) excerpt = excerpt + '...';
  return excerpt;
};

async function buildDocStructure(
  dirPath: string,
  relativePath = '',
): Promise<DocEntry[]> {
  const items: DocEntry[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relativeEntryPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;
      if (shouldSkipEntry(relativeEntryPath)) continue;
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const children = await buildDocStructure(entryPath, relativeEntryPath);
        items.push({
          name: formatName(entry.name),
          path: relativeEntryPath,
          type: 'folder',
          children,
          _rawName: entry.name,
        });
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const nameWithoutExt = entry.name.replace('.md', '');
        items.push({
          name: formatName(nameWithoutExt),
          path: relativeEntryPath.replace('.md', ''),
          type: 'file',
          _rawName: entry.name,
        });
      }
    }
    // '!' prefixed items first, then folders, then files, then alphabetical.
    items.sort((a, b) => {
      const aBang = (a._rawName as string).startsWith('!');
      const bBang = (b._rawName as string).startsWith('!');
      if (aBang && !bBang) return -1;
      if (!aBang && bBang) return 1;
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return items;
  } catch {
    return [];
  }
}

async function searchDocuments(
  dirPath: string,
  query: string,
  relativePath = '',
  results: DocEntry[] = [],
): Promise<DocEntry[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relativeEntryPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;
      if (shouldSkipEntry(relativeEntryPath)) continue;
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await searchDocuments(entryPath, query, relativeEntryPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await readFile(entryPath, 'utf-8');
          const nameWithoutExt = entry.name.replace('.md', '');
          const nameMatch = nameWithoutExt
            .toLowerCase()
            .includes(query.toLowerCase());
          const contentMatch = content
            .toLowerCase()
            .includes(query.toLowerCase());
          if (nameMatch || contentMatch) {
            results.push({
              name: formatName(nameWithoutExt),
              path: relativeEntryPath.replace('.md', ''),
              type: 'file',
              excerpt: contentMatch ? extractExcerpt(content, query) : null,
            });
          }
        } catch {
          // unreadable file: skip, like the legacy route
        }
      }
    }
    return results;
  } catch {
    return results;
  }
}

@Controller('docs')
export class DocsController {
  private readonly docsBasePath = findDocsPath();

  @Get('content')
  async content(
    @Query('path') docPath: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      if (!docPath) {
        response.status(400).json({ error: 'Path parameter is required' });
        return;
      }
      const fileName = docPath.endsWith('.md') ? docPath : `${docPath}.md`;
      const resolvedPath = path.resolve(
        path.join(this.docsBasePath, fileName),
      );
      const resolvedDocsPath = path.resolve(this.docsBasePath);
      if (!resolvedPath.startsWith(resolvedDocsPath)) {
        response
          .status(403)
          .json({ error: 'Access denied: Path outside docs directory' });
        return;
      }
      try {
        const content = await readFile(resolvedPath, 'utf-8');
        const stats = await stat(resolvedPath);
        response.status(200).json({
          content,
          path: docPath,
          lastModified: stats.mtime.toISOString(),
          size: stats.size,
        });
      } catch (fileError) {
        if ((fileError as NodeJS.ErrnoException).code === 'ENOENT') {
          response
            .status(404)
            .json({ error: 'Document not found', path: docPath });
        } else {
          response.status(500).json({
            error: 'Internal server error',
            message: 'Failed to read document due to unexpected file error',
          });
        }
      }
    } catch {
      response.status(500).json({
        error: 'Internal server error',
        message: 'Failed to read document due to general error',
      });
    }
  }

  @Get('structure')
  async structure(@Res() response: Response): Promise<void> {
    try {
      const structure = await buildDocStructure(this.docsBasePath);
      response.status(200).json(structure);
    } catch {
      response.status(500).json({
        error: 'Internal server error',
        message: 'Failed to build documentation structure',
      });
    }
  }

  @Get('search')
  async search(
    @Query('q') query: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      if (!query || query.trim().length === 0) {
        response.status(400).json({ error: 'Query parameter is required' });
        return;
      }
      const results = await searchDocuments(this.docsBasePath, query.trim());
      response.status(200).json(results);
    } catch {
      response.status(500).json({
        error: 'Internal server error',
        message: 'Failed to search documents',
      });
    }
  }
}
