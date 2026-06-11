# Itemize - Business Operations Platform

## 📚 Documentation

This project's documentation has been organized into separate files for better readability and maintenance.

### Core Documentation

- [Getting Started](./!docs/getting-started.md) - Setup instructions for local development

## 🚀 Quick Start

For a quick start guide, see the [Getting Started](./!docs/getting-started.md) documentation.

A comprehensive business operations platform built with React (frontend) and Node.js/Express (backend), designed for deployment on Railway with PostgreSQL. Includes invoicing, CRM, campaigns, e-signatures, workflows, and collaboration tools.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Development Setup

1. **Install all dependencies**:
   ```bash
   npm run install:all
   ```

2. **Start both frontend and backend in development mode**:
   ```bash
   npm run dev
   ```
   This will start:
   - Backend server on `http://localhost:3001`
   - Frontend development server on `http://localhost:5173`

### Individual Services

**Start only backend**:
```bash
npm run dev:backend
```

**Start only frontend**:
```bash
npm run dev:frontend
```

## 📁 Project Structure

```
Itemize/
├── package.json          # Root package.json with scripts
├── README.md            # This file
├── backend/             # Node.js/Express API
│   ├── src/
│   │   └── index.js     # Main server file
│   ├── package.json     # Backend dependencies
│   ├── schema.sql       # Database schema
│   ├── railway.json     # Railway deployment config
│   └── .env.example     # Environment variables template
└── frontend/            # React application
    ├── src/             # React components and pages
    ├── package.json     # Frontend dependencies
    └── vite.config.ts   # Vite configuration
```

## 🛠 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend in development mode |
| `npm run dev:backend` | Start only the backend server |
| `npm run dev:frontend` | Start only the frontend dev server |
| `npm run install:all` | Install dependencies for root, backend, and frontend |
| `npm run build` | Build the frontend for production |
| `npm run start` | Start both services in production mode |

## 🗄️ Database Setup (Local Development)

1. Install PostgreSQL locally
2. Create a database named `itemize`
3. Copy `backend/.env.example` to `backend/.env`
4. Update the `DATABASE_URL` in `.env`
5. Run the schema: `psql -d itemize -f backend/schema.sql`

## 🚀 Railway Deployment

### Backend Deployment
1. Push your code to GitHub
2. Connect your repository to Railway
3. Deploy the backend service (point to `/backend` directory)
4. Add PostgreSQL database service
5. Set environment variables:
   - `DATABASE_URL` (auto-provided by Railway)
   - `FRONTEND_URL` (your frontend URL)
   - Leave `COOKIE_DOMAIN` unset when the backend runs on `*.railway.app`; set it to `.itemize.cloud` only if the backend is served from an `itemize.cloud` subdomain such as `api.itemize.cloud`.
6. Run `schema.sql` in Railway's PostgreSQL console

### Frontend Deployment
1. Deploy frontend as separate Railway service (point to `/frontend` directory)
2. Set environment variable:
   - `VITE_API_URL` (your backend URL)

## 🔧 Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://username:password@localhost:5432/itemize
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
# Optional. Do not set this for a Railway backend URL like *.railway.app.
# COOKIE_DOMAIN=.itemize.cloud
GEMINI_API_KEY=your-gemini-api-key
MARKETING_CHAT_AI_ENABLED=true
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001
# Optional. Defaults enabled unless set to false.
VITE_MARKETING_CHAT_ENABLED=true
```

## 📋 Features

**Core Workspaces**
- ✅ Canvas-based list and item management
- ✅ Notes with sharing and collaboration
- ✅ Whiteboards for visual planning
- ✅ Wireframes and diagrams
- ✅ Encrypted vaults for sensitive data

**Business Operations**
- ✅ Invoicing and estimates
- ✅ Campaign management
- ✅ Contacts and CRM
- ✅ E-signatures
- ✅ Forms and data collection
- ✅ Workflows and automation

**Communication**
- ✅ Email templates and broadcasts
- ✅ SMS templates and campaigns
- ✅ Calendar integrations
- ✅ Segments and audience targeting

**Analytics & Operations**
- ✅ Analytics and reporting
- ✅ Pipelines and sales tracking
- ✅ Reputation management
- ✅ Social integrations

**Platform**
- ✅ Responsive design with Tailwind CSS
- ✅ Modern UI components with shadcn/ui
- ✅ PostgreSQL database with JSONB storage
- ✅ RESTful API with Express.js
- ✅ OAuth and authentication

## 🛡️ Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- shadcn/ui components
- TanStack Query for data fetching
- React Router for navigation

**Backend:**
- Node.js with Express.js
- PostgreSQL with pg driver
- CORS and Helmet for security
- Morgan for logging
- dotenv for environment management

**Deployment:**
- Railway for hosting
- PostgreSQL on Railway
- GitHub for version control
