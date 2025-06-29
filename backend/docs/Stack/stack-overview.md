# Itemize.cloud Technology Stack Overview

## Frontend Stack

### Core Framework
- **React 18**: Modern React with hooks
- **Vite**: Fast build tool and development server
- **TypeScript**: Type-safe JavaScript development

### UI/UX Libraries
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/ui**: Modern component library
- **Lucide React**: Icon library
- **React Rnd**: Resizable and draggable components
- **React Sketch Canvas**: Sketching functionality for whiteboards

### State Management
- **React Query/TanStack Query**: Server state management and caching

### Development Tools
- **ESLint**: Code linting and quality
- **Vite**: Development and build tooling

## Backend Stack

### Core Framework
- **Node.js**: JavaScript runtime
- **Express.js**: Web framework

### Data & Database
- **PostgreSQL**: Relational database
- **pg**: PostgreSQL client for Node.js
- **Sequelize**: ORM for Node.js

### External Integrations
- **Google Generative AI**: AI suggestions for lists

### Security & Authentication
- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **jsonwebtoken**: JWT authentication

### Development Tools
- **Nodemon**: Development server auto-restart

## Infrastructure & Deployment

### Development
- **Git**: Version control

### Production
- **Railway**: Platform-as-a-Service hosting
- **Environment Variables**: Configuration management

## Key Dependencies

### Frontend
```json
{
  "react": "^18.3.1",
  "vite": "^5.4.1",
  "tailwindcss": "^3.4.11",
  "@tanstack/react-query": "^5.56.2"
}
```

### Backend
```json
{
  "express": "^4.18.2",
  "pg": "^8.16.0",
  "sequelize": "^6.37.7",
  "@google/generative-ai": "^0.24.1",
  "jsonwebtoken": "^9.0.2"
}
```

## Architecture Principles

1. **Separation of Concerns**: Clear separation between frontend and backend
2. **API-First Design**: Backend provides RESTful APIs
3. **Type Safety**: TypeScript in the frontend
4. **Modern Tooling**: Latest stable versions of all tools

## Performance Considerations

- **Frontend**: Optimized builds
- **Backend**: Efficient API design

This stack provides a modern, scalable, and maintainable foundation for managing and organizing digital assets.
