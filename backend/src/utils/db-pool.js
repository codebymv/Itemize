const { Pool } = require('pg');
const { logger } = require('../utils/logger');

module.exports = (databaseUrl) => {
  const poolConfig = {
    connectionString: databaseUrl || process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false,
    } : false,
    
    max: process.env.NODE_ENV === 'production' ? 20 : 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,
    
    idle: (error, client) => {
      logger.warn('Idle client error', { error });
    },
  };
  
  const pool = new Pool(poolConfig);
  
  pool.on('connect', () => {
    logger.debug('New database connection established');
  });
  
  pool.on('error', (error) => {
    logger.error('Unexpected database pool error', error);
    
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      logger.warn('Database connection lost, will attempt reconnection');
    }
  });
  
  process.on('SIGINT', async () => {
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Error closing database pool', error);
    }
  });
  
  return {
    createDbConnection: () => pool,
    pool: pool,
  };
};