# Itemize.cloud API Overview

## Introduction

The Itemize.cloud API provides a comprehensive suite of tools for managing and organizing your digital assets. It allows you to create, manage, and share lists of items, with a focus on flexibility and ease of use. The API is built with a modern, scalable architecture, and it is designed to be used by both the Itemize.cloud frontend and third-party applications.

## API Philosophy

The Itemize.cloud API is built on the following principles:

1.  **Simplicity**: The API is designed to be easy to use and understand, with a consistent and predictable structure.
2.  **Flexibility**: The API provides a wide range of features and options, allowing you to tailor it to your specific needs.
3.  **Scalability**: The API is built to handle a large number of users and requests, with a focus on performance and reliability.
4.  **Security**: The API uses modern authentication and authorization mechanisms to protect your data.

## Core Functionality

The API provides the following core functionality:

*   **List Management**: Create, read, update, and delete lists with full CRUD operations.
*   **Note Management**: Create, edit, and organize rich text notes with categories.
*   **Whiteboard Management**: Create and manage digital whiteboards with drawing capabilities.
*   **Infinite Canvas**: Position and organize content on an infinite canvas workspace.
*   **Sharing System**: Share lists, notes, and whiteboards via secure public links.
*   **Documentation Service**: Access integrated API documentation and help resources.
*   **User Management**: Manage user accounts, authentication, and permissions.
*   **Category System**: Organize content with user-defined categories.

## Technical Details

*   **Base URL**: `https://itemize.cloud/api`
*   **Response Format**: All API responses are in JSON format.
*   **Authentication**: The API uses JWT-based authentication.
*   **Rate Limiting**: The API uses a tier-based rate limiting system.

## Getting Started

To get started with the Itemize.cloud API, you will need to:

1.  Create an account on [itemize.cloud](https://itemize.cloud).
2.  Generate an API key from your account settings.
3.  Use the API key to authenticate your requests.

## API Endpoints

The API is organized into several endpoint categories:

### Content Management
*   **[Lists API](./endpoints/lists.md)**: Complete CRUD operations for lists and items
*   **[Notes API](./endpoints/notes.md)**: Create and manage rich text notes
*   **[Whiteboards API](./endpoints/whiteboards.md)**: Digital whiteboard management
*   **[Categories API](./endpoints/categories.md)**: Organize content with categories

### Sharing & Collaboration
*   **Sharing Endpoints**: Enable public sharing of lists, notes, and whiteboards
    - `POST /api/lists/{id}/share` - Share a list
    - `POST /api/notes/{id}/share` - Share a note
    - `POST /api/whiteboards/{id}/share` - Share a whiteboard
    - `DELETE /api/{type}/{id}/share` - Revoke sharing
*   **Public Access**: View shared content without authentication
    - `GET /api/shared/list/{token}` - View shared list
    - `GET /api/shared/note/{token}` - View shared note
    - `GET /api/shared/whiteboard/{token}` - View shared whiteboard

### Documentation & Help
*   **[Documentation API](./endpoints/docs.md)**: Access integrated documentation
    - `GET /api/docs/content` - Get documentation content
    - `GET /api/docs/structure` - Get documentation structure
    - `GET /api/docs/search` - Search documentation

### AI & Enhancement
*   **[AI Suggestions API](./endpoints/ai-suggestions.md)**: AI-powered content suggestions

## Quick Reference

### Core List Operations
*   `GET /api/lists` - Get all user lists
*   `POST /api/lists` - Create a new list
*   `PUT /api/lists/{listId}` - Update a list
*   `DELETE /api/lists/{listId}` - Delete a list

### Core Note Operations
*   `GET /api/notes` - Get all user notes
*   `POST /api/notes` - Create a new note
*   `PUT /api/notes/{noteId}` - Update a note
*   `DELETE /api/notes/{noteId}` - Delete a note

### Core Whiteboard Operations
*   `GET /api/whiteboards` - Get all user whiteboards
*   `POST /api/whiteboards` - Create a new whiteboard
*   `PUT /api/whiteboards/{whiteboardId}` - Update a whiteboard
*   `DELETE /api/whiteboards/{whiteboardId}` - Delete a whiteboard
