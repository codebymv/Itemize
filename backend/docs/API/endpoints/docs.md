# Documentation API

## Overview

The Documentation API provides endpoints for accessing API documentation, implementation guides, and help resources within itemize.cloud. This service enables the integrated documentation system accessible through the `/help` page.

## Base Route

`/api/docs`

## Authentication

All documentation endpoints are public and do not require authentication.

## Endpoints

### Get Documentation Content

Retrieves the markdown content for a specific documentation file.

**Endpoint:** `GET /api/docs/content`

**Parameters:**
- `path` (query, required): The path to the documentation file

**Examples:**
```
GET /api/docs/content?path=getting-started
GET /api/docs/content?path=API/api-overview
GET /api/docs/content?path=Implementations/Sharing/sharing-overview
```

**Response:**
```json
{
  "content": "# Getting Started\n\nWelcome to itemize.cloud...",
  "path": "getting-started",
  "lastModified": "2024-01-15T10:00:00.000Z",
  "size": 1024
}
```

**Status Codes:**
- `200 OK`: Documentation content retrieved successfully
- `400 Bad Request`: Path parameter is missing
- `403 Forbidden`: Access denied (path outside docs directory)
- `404 Not Found`: Documentation file not found
- `500 Internal Server Error`: Server error

### Get Documentation Structure

Retrieves the hierarchical structure of the documentation directory.

**Endpoint:** `GET /api/docs/structure`

**Response:**
```json
[
  {
    "name": "API",
    "type": "directory",
    "path": "API",
    "children": [
      {
        "name": "api-overview.md",
        "type": "file",
        "path": "API/api-overview.md"
      },
      {
        "name": "endpoints",
        "type": "directory", 
        "path": "API/endpoints",
        "children": [
          {
            "name": "lists.md",
            "type": "file",
            "path": "API/endpoints/lists.md"
          }
        ]
      }
    ]
  },
  {
    "name": "getting-started.md",
    "type": "file",
    "path": "getting-started.md"
  }
]
```

### Search Documentation

Searches through documentation files for specific content.

**Endpoint:** `GET /api/docs/search`

**Parameters:**
- `q` (query, required): The search query

**Example:**
```
GET /api/docs/search?q=sharing
```

**Response:**
```json
{
  "query": "sharing",
  "results": [
    {
      "file": "Implementations/Sharing/sharing-overview.md",
      "title": "Sharing System Overview",
      "matches": [
        {
          "line": 5,
          "content": "The itemize.cloud sharing system enables users to share...",
          "context": "...enables users to share their lists, notes, and whiteboards..."
        }
      ],
      "score": 0.95
    }
  ],
  "totalResults": 1
}
```

**Status Codes:**
- `200 OK`: Search completed successfully
- `400 Bad Request`: Query parameter is missing or empty
- `500 Internal Server Error`: Search error

## Implementation Details

### File System Structure

The documentation service reads from the `!docs` directory structure:

```
!docs/
├── API/
│   ├── api-overview.md
│   └── endpoints/
│       ├── lists.md
│       ├── notes.md
│       └── whiteboards.md
├── Implementations/
│   ├── Sharing/
│   │   ├── sharing-overview.md
│   │   └── sharing-api.md
│   └── ...
└── getting-started.md
```

### Security Features

- **Path Validation**: Ensures requested paths are within the docs directory
- **Directory Traversal Protection**: Prevents access to files outside the docs folder
- **Read-Only Access**: Documentation endpoints only provide read access
- **No Authentication Required**: All documentation is publicly accessible

### Content Processing

- **Markdown Support**: All documentation files are in Markdown format
- **File Metadata**: Returns file size and last modified timestamp
- **UTF-8 Encoding**: All files are read with UTF-8 encoding
- **Error Handling**: Graceful handling of missing or inaccessible files

### Frontend Integration

The documentation service integrates with the frontend through:

- **DocsService**: Frontend service class for API communication
- **Help Page**: Accessible at `/help` route
- **Fallback Content**: Static content when API is unavailable
- **Navigation**: Dynamic navigation based on documentation structure

## Usage Examples

### Basic Content Retrieval

```javascript
// Frontend usage
const docsService = new DocsService();
const content = await docsService.getDocContent('getting-started');
```

### Search Functionality

```javascript
// Search for specific topics
const results = await fetch('/api/docs/search?q=API endpoints');
const searchData = await results.json();
```

### Structure Navigation

```javascript
// Get full documentation structure
const structure = await fetch('/api/docs/structure');
const docTree = await structure.json();
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message description",
  "message": "Additional context if available"
}
```

Common error scenarios:
- **Missing Path**: When path parameter is not provided
- **Invalid Path**: When path contains invalid characters or traversal attempts
- **File Not Found**: When requested documentation file doesn't exist
- **Permission Denied**: When access to file is restricted
- **Server Error**: When unexpected errors occur during file operations
