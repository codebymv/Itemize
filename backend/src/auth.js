const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const router = express.Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Token generation helper
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};

// Google OAuth login endpoint
router.post('/google-login', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'Authorization code is required' });
    }

    // Add debugging to see what's being sent
    console.log('Attempting OAuth token exchange with:', { 
      clientIdLength: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.length : 0,
      clientSecretLength: GOOGLE_CLIENT_SECRET ? GOOGLE_CLIENT_SECRET.length : 0,
      code: code ? code.substring(0, 10) + '...' : 'missing',
      redirectUri: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`
    });
    
    // Exchange authorization code for access token
    let googleUser;
    try {
      console.log('Actual values being used for OAuth exchange:', {
        client_id_partial: GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.substring(0, 10)}...` : 'MISSING',
        client_secret_present: !!GOOGLE_CLIENT_SECRET,
        code_length: code ? code.length : 0,
        redirect_uri: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`
      });

      const tokenData = {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`
      };

      console.log('Making token request with data:', JSON.stringify(tokenData));

      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', tokenData);
      const { access_token } = tokenResponse.data;

      // Get user info from Google
      const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      
      googleUser = userResponse.data;
    } catch (error) {
      console.error('Detailed token exchange error:', error.response ? {
        status: error.response.status,
        data: error.response.data
      } : error.message);
      
      return res.status(401).json({ message: 'Google authentication failed', error: error.response?.data || error.message });
    }
    
    // Create user object
    const user = {
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture
    };

    // Generate JWT tokens
    const { accessToken: jwtToken, refreshToken } = generateTokens(user.id);

    res.json({
      token: jwtToken,
      refreshToken: refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      user: user
    });

  } catch (error) {
    console.error('Google OAuth error:', error.response?.data || error.message);
    res.status(401).json({ 
      message: 'Authentication failed', 
      error: error.response?.data?.error_description || error.message 
    });
  }
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    // Verify refresh token (allow expired access tokens)
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(decoded.userId);
    
    res.json({
      token: accessToken,
      refreshToken: refreshToken,
      expiresIn: 7 * 24 * 60 * 60 // 7 days in seconds
    });

  } catch (error) {
    console.error('Token refresh error:', error.message);
    res.status(401).json({ message: 'Token refresh failed, please login again' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  // In a production app, you might want to blacklist the token
  res.json({ message: 'Logged out successfully' });
});

// Middleware to verify JWT tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token is required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

module.exports = { router, authenticateToken };