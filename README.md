# Itemize - Business Operations Platform

A comprehensive business operations platform built with React (frontend) and NestJS/GraphQL (backend), deployed on Railway with PostgreSQL. Includes invoicing, CRM, campaigns, e-signatures, workflows, and collaboration tools.

## 📚 Documentation

- [Getting Started](./!docs/getting-started.md) - Setup instructions for local development
- `backend/docs/` - Architecture, API, and implementation docs (synced mirror; edit `!docs/` and run `npm run docs:sync`)

## 📁 Project Structure

```
itemize.cloud/
├── package.json          # Root workspace scripts (workspaces: frontend, backend, db)
├── backend/              # NestJS/GraphQL API (the canonical backend)
│   ├── src/              # Nest modules: GraphQL resolvers + retained HTTP controllers
│   ├── test/integration/ # Integration specs (run against a Dockerized Postgres)
│   ├── pdf-service/      # Invoice PDF renderer (puppeteer, ported from Express)
│   ├── Dockerfile        # Railway production image (includes Chrome for PDFs)
│   └── railway.json      # Railway deploy config
├── db/                   # Database workspace: schema authority
│   ├── migrations/       # Numbered migration stream (the schema source of truth)
│   ├── src/              # Migration modules + shared db utilities
│   ├── scripts/          # initialize-test-database, execute-migration, fresh test gate
│   └── test-support/     # Test DB helpers used by backend integration specs
├── frontend/             # React application (Vite + TypeScript)
└── !docs/                # Documentation source of truth
```

## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- Docker (for the integration test database)

### Development Setup

```bash
npm install
npm run dev
```

This starts:
- NestJS GraphQL API on `http://localhost:3100` (`/graphql` + retained HTTP routes under `/api`)
- Frontend development server on `http://localhost:5173`
- Docs watcher (syncs `!docs/` into `backend/docs/`)

### Individual Services

```bash
npm run dev:graphql    # backend only
npm run dev:frontend   # frontend only
```

## 🛠 Key Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Backend + frontend + docs watcher |
| `npm run build` | Docs sync/check + backend + frontend production builds |
| `npm run migrate` | Run pending database migrations (db workspace) |
| `npm run test` | Backend unit suite + frontend tests |
| `npm run release:integration` | Fresh-database integration gate (Docker Postgres, full migration stream, all integration specs) |
| `npm run release:check` | Full pre-release gate |

## 🗄️ Database

The `db/` workspace owns the schema: `db/migrations/` is the numbered migration stream, applied by `npm run migrate` (tracked in `schema_migrations`). The integration gate (`npm run release:integration`) boots a disposable Postgres in Docker, applies every migration from zero, and runs the backend integration specs against it.

For local development, copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.

## 🚀 Railway Deployment

Production runs as separate Railway services:

- **GraphQL backend** (`backend/`): built from its `Dockerfile` (includes Chrome for invoice PDF rendering). Serves `api.itemize.cloud` on port 3100. Deployed with `railway up` from a staged copy of `backend/` (the CLI must not walk up to the repo root).
- **Frontend** (`frontend/`): Vite build, serves `itemize.cloud`.
- **PostgreSQL**: Railway Postgres; migrations run via `npm run migrate` with `DATABASE_URL` pointed at it.

Backend environment variables are enumerated in `backend/.env.example`; `npm run build` enforces that contract (`config:check`). Leave `COOKIE_DOMAIN` unset on `*.railway.app`; set `.itemize.cloud` only when serving from an `itemize.cloud` subdomain.

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

## 🛡️ Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite, Tailwind CSS, shadcn/ui
- TanStack Query, React Router

**Backend (`backend/`):**
- NestJS with Apollo GraphQL (code-first)
- Retained HTTP controllers for webhooks, OAuth callbacks, uploads, and public widgets
- Socket.IO realtime host with a Postgres outbox
- Background workers (email/social/subscription webhooks, calendar sync, trial reminders, file cleanup)
- PostgreSQL with pg driver, Winston logging, Sentry, express-rate-limit ingress guard

**Deployment:**
- Railway (Docker image for the backend), PostgreSQL on Railway
