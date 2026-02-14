const { v4: uuid } = require('uuid');
const { logger } = require('../utils/logger');

const correlationIdMiddleware = (req, res, next) => {
  req.id = req.headers['x-request-id'] || req.headers['x-correlation-id'] || uuid();
  req.start = Date.now();
  
  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Correlation-ID', req.id);
  
  const originalMeta = { ...logger.defaultMeta };
  
  logger.defaultMeta = {
    ...originalMeta,
    correlationId: req.id,
    path: req.path,
    method: req.method,
  };
  
  res.on('finish', () => {
    const duration = Date.now() - req.start;
    logger.info('Request completed', {
      correlationId: req.id,
      path: req.path,
      method: req.method,
      status: res.statusCode,
      duration,
    });
    
    logger.defaultMeta = originalMeta;
  });
  
  next();
};

module.exports = correlationIdMiddleware;