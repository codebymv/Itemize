// Load environment variables
require('dotenv').config();

// Create Express app
const express = require('express');
const app = express();
const port = process.env.PORT || 3001;

// Log startup
console.log(`Starting minimal server on port ${port} at ${new Date().toISOString()}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

// Set up health check endpoint for Railway
app.get('/health', (req, res) => {
  console.log('Health check hit at:', new Date().toISOString());
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Also support /api/health for consistency
app.get('/api/health', (req, res) => {
  console.log('API Health check hit at:', new Date().toISOString());
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Add a catch-all route
app.use('*', (req, res) => {
  res.status(200).send('Server is running. Use /health or /api/health to check status.');
});

// Start the server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log('Health check endpoints available at:');
  console.log('  - /health');
  console.log('  - /api/health');
});

server.on('error', (error) => {
  console.error('Server error:', error.message);
});
