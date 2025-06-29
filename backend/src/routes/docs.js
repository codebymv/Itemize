const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// Function to find the docs folder in different deployment scenarios
const findDocsPath = () => {
  // Try multiple possible locations for the docs folder
  const possiblePaths = [
    path.join(__dirname, '../../../!docs'),  // Original path for other projects
    path.join(__dirname, '../../docs'),      // Current project structure
    path.join(__dirname, '../../../docs')    // Alternative structure
  ];

  for (const docsPath of possiblePaths) {
    console.log(`[findDocsPath] Attempting to use docs path: ${docsPath}`);
    try {
      const stats = require('fs').statSync(docsPath);
      if (stats.isDirectory()) {
        console.log(`[findDocsPath] ✅ Found docs folder at: ${docsPath}`);
        // List contents to verify
        try {
          const contents = require('fs').readdirSync(docsPath);
          console.log(`[findDocsPath] Contents: ${contents.join(', ')}`);
        } catch (e) {
          console.log(`[findDocsPath] Could not list contents of ${docsPath}: ${e.message}`);
        }
        return docsPath;
      }
    } catch (error) {
      console.log(`[findDocsPath] Path not found: ${docsPath} - ${error.message}`);
    }
  }

  console.error('[findDocsPath] No docs folder found at any expected location.');
  return possiblePaths[0]; // Return the first path as fallback
};

// Base path to the docs folder
const DOCS_BASE_PATH = findDocsPath();
console.log(`[DOCS_INIT] Final docs base path: ${DOCS_BASE_PATH}`);

/**
 * Get markdown content for a specific document path
 * GET /api/docs/content?path=getting-started
 * GET /api/docs/content?path=API/api-overview
 */
router.get('/content', async (req, res) => {
  console.log('[GET /api/docs/content] Route handler entered.');
  try {
    const { path: docPath } = req.query;
    console.log(`[GET /api/docs/content] Received request for docPath: ${docPath}`);
    
    if (!docPath) {
      console.log('[GET /api/docs/content] Path parameter is missing.');
      return res.status(400).json({
        error: 'Path parameter is required'
      });
    }

    // Construct the full file path
    const fileName = docPath.endsWith('.md') ? docPath : `${docPath}.md`;
    const fullPath = path.join(DOCS_BASE_PATH, fileName);
    console.log(`[GET /api/docs/content] Attempting to read file from fullPath: ${fullPath}`);

    // Security check: ensure the path is within the docs directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedDocsPath = path.resolve(DOCS_BASE_PATH);
    
    console.log(`[GET /api/docs/content] Resolved file path: ${resolvedPath}`);
    console.log(`[GET /api/docs/content] Resolved docs base path: ${resolvedDocsPath}`);

    if (!resolvedPath.startsWith(resolvedDocsPath)) {
      console.warn(`[GET /api/docs/content] Access denied: Path ${resolvedPath} is outside docs directory ${resolvedDocsPath}`);
      return res.status(403).json({
        error: 'Access denied: Path outside docs directory'
      });
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const stats = await fs.stat(resolvedPath);
      console.log(`[GET /api/docs/content] Successfully read file: ${resolvedPath}`);
      
      res.json({
        content,
        path: docPath,
        lastModified: stats.mtime.toISOString(),
        size: stats.size
      });
      console.log('[GET /api/docs/content] Response sent successfully.');
    } catch (fileError) {
      console.error(`[GET /api/docs/content] Error during file operation:`, fileError);
      if (fileError.code === 'ENOENT') {
        console.warn(`[GET /api/docs/content] File not found: ${resolvedPath}`);
        res.status(404).json({
          error: 'Document not found',
          path: docPath
        });
      } else {
        console.error(`[GET /api/docs/content] Unhandled file error:`, fileError);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to read document due to unexpected file error'
        });
      }
    }
  } catch (error) {
    console.error('[GET /api/docs/content] General error in content endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to read document due to general error'
    });
  }
});

/**
 * Get the structure of the documentation directory
 * GET /api/docs/structure
 */
router.get('/structure', async (req, res) => {
  try {
    const structure = await buildDocStructure(DOCS_BASE_PATH);
    res.json(structure);
  } catch (error) {
    console.error('Error building doc structure:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to build documentation structure'
    });
  }
});

/**
 * Search documentation files
 * GET /api/docs/search?q=API
 */
router.get('/search', async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Query parameter is required'
      });
    }

    const searchResults = await searchDocuments(DOCS_BASE_PATH, query.trim());
    res.json(searchResults);
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to search documents'
    });
  }
});

/**
 * Recursively build the documentation directory structure
 */
async function buildDocStructure(dirPath, relativePath = '') {
  console.log(`[buildDocStructure] Called for dirPath: ${dirPath}, relativePath: ${relativePath}`);
  const items = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    console.log(`[buildDocStructure] Found entries in ${dirPath}: ${entries.map(e => e.name).join(', ')}`);
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const relativeEntryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        console.log(`[buildDocStructure] Processing directory: ${entry.name}`);
        const children = await buildDocStructure(entryPath, relativeEntryPath);
        items.push({
          name: formatName(entry.name),
          path: relativeEntryPath,
          type: 'folder',
          children
        });
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        console.log(`[buildDocStructure] Processing markdown file: ${entry.name}`);
        const nameWithoutExt = entry.name.replace('.md', '');
        const pathWithoutExt = relativeEntryPath.replace('.md', '');
        
        items.push({
          name: formatName(nameWithoutExt),
          path: pathWithoutExt,
          type: 'file'
        });
      }
    }
    
    // Sort items: folders first, then files, both alphabetically
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    return items;
  } catch (error) {
    console.error(`[buildDocStructure] Error reading directory ${dirPath}:`, error);
    return [];
  }
}

/**
 * Search for documents containing the query text
 */
async function searchDocuments(dirPath, query, relativePath = '', results = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const relativeEntryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        await searchDocuments(entryPath, query, relativeEntryPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(entryPath, 'utf-8');
          const nameWithoutExt = entry.name.replace('.md', '');
          const pathWithoutExt = relativeEntryPath.replace('.md', '');
          
          // Search in filename and content
          const nameMatch = nameWithoutExt.toLowerCase().includes(query.toLowerCase());
          const contentMatch = content.toLowerCase().includes(query.toLowerCase());
          
          if (nameMatch || contentMatch) {
            results.push({
              name: formatName(nameWithoutExt),
              path: pathWithoutExt,
              type: 'file',
              excerpt: contentMatch ? extractExcerpt(content, query) : null
            });
          }
        } catch (readError) {
          console.error(`Error reading file ${entryPath}:`, readError);
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error searching directory ${dirPath}:`, error);
    return results;
  }
}

/**
 * Extract a text excerpt around the search query
 */
function extractExcerpt(content, query, contextLength = 100) {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  
  if (index === -1) return null;
  
  const start = Math.max(0, index - contextLength);
  const end = Math.min(content.length, index + query.length + contextLength);
  
  let excerpt = content.substring(start, end);
  
  // Add ellipsis if we truncated
  if (start > 0) excerpt = '...' + excerpt;
  if (end < content.length) excerpt = excerpt + '...';
  
  return excerpt;
}

/**
 * Format file/directory names for display
 */
function formatName(name) {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Get fallback content for critical documents when files aren't available
 */
function getFallbackDocContent(docPath) {
  const fallbackDocs = {
    'getting-started': '# Documentation Not Found\n\nWe could not find the requested documentation. Please check the URL or try again later.'
  };

  return fallbackDocs[docPath] || null;
}

module.exports = router;