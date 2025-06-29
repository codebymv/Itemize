# Backend Configuration

## Express.js Server Configuration

The backend uses Express.js. Main server configuration is in `src/index.js`:

```javascript
// Load environment variables first, before any other imports
require('dotenv').config();

// Import necessary packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Basic middleware that won't break anything
app.use(express.json());
app.use(helmet());
app.use(morgan('combined'));

// Force HTTPS in production (but exclude health checks)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Skip HTTPS redirect for health check endpoints
    if (req.path === '/health' || req.path === '/api/health') {
      return next();
    }
    
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

app.use(cors({
  origin: process.env.FRONTEND_URL || (
    process.env.NODE_ENV === 'production' 
      ? 'https://itemize.cloud' 
      : 'http://localhost:5173'
  ),
  credentials: true
}));

// Set up health check endpoint for Railway - KEEP THIS WORKING
app.get('/health', (req, res) => {
  console.log('Health check hit at:', new Date().toISOString());
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Also support /api/health for consistency
app.get('/api/health', (req, res) => {
  console.log('API Health check hit at:', new Date().toISOString());
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Docs routes
const docsRoutes = require('./routes/docs');
app.use('/docs', docsRoutes); // Mounted at /docs

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server - KEEP BINDING TO 0.0.0.0 for Railway
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log('Health check endpoints available at:');
  console.log('  - /health');
  console.log('  - /api/health');
});

server.on('error', (error) => {
  console.error('Server error:', error.message);
});
```

## Environment Configuration

### .env.example
```env
# The URL of the frontend application
FRONTEND_URL=http://localhost:5173

# The connection string for the PostgreSQL database
DATABASE_URL=postgresql://user:password@host:port/database

# The secret key for signing JWTs
JWT_SECRET=your-jwt-secret

# The API key for the Gemini API
GEMINI_API_KEY=your-gemini-api-key
```

## Package.json Scripts

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```
