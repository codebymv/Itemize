const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const router = express.Router();
const { User } = require('./models');

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Error handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Token generation helper
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};

/**
 * Handle Google OAuth login endpoint using direct token-based approach
 * This endpoint receives user data from Google directly from the frontend
 */
router.post('/google-login', asyncHandler(async (req, res) => {
  try {
    const { googleId, email, name, picture } = req.body;
    
    if (!googleId || !email || !name) {
      return res.status(400).json({ error: 'Missing user information' });
    }

    console.log('Processing Google login for:', email);
    
    // Find or create a user in our database
    let user;
    try {
      console.log('Looking up user by email:', email);
      user = await User.findOne({ where: { email } });
      
      if (!user) {
        console.log('Creating new user:', email);
        user = await User.create({
          email,
          name,
          googleId,
          picture,
          provider: 'google'
        });
      } else {
        // Update existing user with Google info
        console.log('Updating existing user:', email);
        user.googleId = googleId;
        user.name = user.name || name; // Only update if name is not set
        user.picture = picture;
        user.provider = 'google';
        await user.save();
      }
    } catch (error) {
      console.error('Error handling user:', error);
      res.status(500).json({ error: 'Database error occurred' });
      return;
    }
    
    // Create JWT token with 7-day expiry
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return the user data and token
    res.status(200).json({
      token,
      user: {
        uid: user.id, // Use uid to match frontend expected format
        email: user.email,
        name: user.name,
        photoURL: user.picture // Use photoURL to match frontend expected format
      }
    });
  } catch (error) {
    console.error('Google login error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to process authentication' });
  }
}));

/**
 * Handle Google ID token verification endpoint for Google One Tap
 */
router.post('/google-credential', asyncHandler(async (req, res) => {
  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    // Verify the Google ID token
    const response = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    );
    
    const { sub: googleId, email, name, picture } = response.data;
    
    // Find or create a user in our database
    let user;
    try {
      user = await User.findOne({ where: { email } });
      
      if (!user) {
        user = await User.create({
          email,
          name,
          googleId,
          picture,
          provider: 'google'
        });
      } else {
        // Update existing user with Google info
        user.googleId = googleId;
        user.name = user.name || name;
        user.picture = picture;
        user.provider = 'google';
        await user.save();
      }
    } catch (error) {
      console.error('Error handling Google credential user:', error);
      res.status(500).json({ error: 'Database error, using in-memory user store' });
      return;
    }
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      token,
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        photoURL: user.picture
      }
    });
  } catch (error) {
    console.error('Google credential verification error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to verify Google credential' });
  }
}));

/**
 * Logout endpoint
 */
router.post('/logout', (req, res) => {
  // We don't need to do much here since we're using stateless JWT
  // The frontend will remove the token from storage
  res.status(200).json({ message: 'Logged out successfully' });
});

/**
 * Middleware to authenticate JWT
 */
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// Export the router and middleware
module.exports = {
  router,
  authenticateJWT
};