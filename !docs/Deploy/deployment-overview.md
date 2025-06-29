# Deployment Overview

## Deployment Strategy

Itemize.cloud uses Railway as the primary deployment platform, providing seamless deployment with automatic scaling and easy environment management.

## Deployment Platforms

### Primary: Railway
- **Backend**: Node.js service with automatic builds
- **Frontend**: Static site deployment
- **Database**: PostgreSQL (managed by Railway)
- **Monitoring**: Built-in metrics and logging
- **SSL**: Automatic HTTPS with custom domains

## Repository Structure for Deployment

```
itemize.cloud/
├── backend/
│   ├── package.json     # Backend dependencies
│   ├── src/            # Source code
│   ├── railway.json     # Railway configuration
│   └── Procfile         # Process file for Railway
├── frontend/
│   ├── package.json     # Frontend dependencies
│   ├── src/            # Source code
│   └── railway.toml     # Railway configuration
└── !docs/              # Documentation
```

## Railway Configuration

### backend/railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### frontend/railway.toml
```toml
[build]
  builder = "NIXPACKS"
  buildCommand = "npm install && npm run build"

[deploy]
  startCommand = "npx serve -s dist"
  healthcheckPath = "/"
  healthcheckTimeout = 100
```

### backend/Procfile
```
web: npm start
```

## Environment Configuration

Environment variables are managed through Railway's dashboard. Key variables include:

*   `FRONTEND_URL`: The URL of the frontend application.
*   `DATABASE_URL`: The connection string for the PostgreSQL database.
*   `JWT_SECRET`: The secret key for signing JWTs.
*   `GEMINI_API_KEY`: The API key for the Gemini API.

## Deployment Process

Deployment to Railway is typically automated upon pushing changes to the main branch. Manual deployments can be triggered via the Railway CLI or dashboard.

### Automated Deployment (Recommended)

1.  **Connect to GitHub**: Link your GitHub repository to a Railway project.
2.  **Automatic Builds**: Railway automatically detects `package.json` and `railway.json`/`railway.toml` files and builds the services.
3.  **Service Deployment**: Each service (backend, frontend) is deployed as a separate component within the Railway project.

### Manual Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link project to Railway
railway link

# Deploy backend
cd backend
railway up

# Deploy frontend
cd ../frontend
railway up
```

## Health Checks

Both backend and frontend services have health check endpoints configured for Railway to monitor their status:

*   **Backend**: `GET /health` and `GET /api/health`
*   **Frontend**: `GET /` (serves `index.html`)
