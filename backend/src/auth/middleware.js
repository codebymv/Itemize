const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

const authenticateJWT = (req, res, next) => {
  const token = req.cookies?.itemize_auth;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication required', code: 'NO_TOKEN' }
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: { message: 'Token expired', code: 'TOKEN_EXPIRED' }
        });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid token', code: 'INVALID_TOKEN' }
        });
      }
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication failed', code: 'AUTH_FAILED' }
      });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication required', code: 'AUTH_REQUIRED' }
    });
  }

  const pool = req.dbPool;
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: { message: 'Database connection unavailable', code: 'DB_UNAVAILABLE' }
    });
  }

  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'USER_NOT_FOUND' }
      });
    }

    const userRole = result.rows[0].role || 'USER';

    if (userRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { message: 'Admin access required', code: 'FORBIDDEN' }
      });
    }

    req.userRole = userRole;
    next();
  } catch (error) {
    console.error('Error checking admin role:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' }
    });
  }
};

module.exports = {
  authenticateJWT,
  requireAdmin
};
