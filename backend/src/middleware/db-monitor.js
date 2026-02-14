const { logger } = require('../utils/logger');

module.exports = (pool) => (req, res, next) => {
  const before = pool.totalCount;
  
  res.on('finish', () => {
    const after = pool.totalCount;
    const waiting = pool.waitingCount;
    
    if (before !== after || waiting > 0) {
      logger.info('Database pool status', {
        total: after,
        waiting,
        idle: pool.idleCount,
      });
    }
  });
  
  next();
};