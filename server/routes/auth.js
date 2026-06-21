import { Router } from 'express';
import bcrypt       from 'bcryptjs';
import jwt          from 'jsonwebtoken';
import User         from '../models/User.js';

const router = Router();

// ── Shared handler (called after middleware gate) ─────────────────────────────
async function registerHandler(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash });

    res.status(201).json({
      success: true,
      data: { userId: user._id, username: user.username },
    });
  } catch (err) {
    console.error('POST /api/auth/register error:', err.message);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { token }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    // Demo Mode bypass for HR/guest review
    if (username.toLowerCase() === 'demo') {
      let demoUser = await User.findOne({ username: 'demo' });
      if (!demoUser) {
        // Automatically create a demo user if they don't exist
        const dummyHash = await bcrypt.hash('demo12345678', 12);
        demoUser = await User.create({ username: 'demo', passwordHash: dummyHash });
      }

      const token = jwt.sign(
        { userId: demoUser._id, username: demoUser.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({ success: true, data: { token, username: demoUser.username } });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ success: true, data: { token, username: user.username } });
  } catch (err) {
    console.error('POST /api/auth/login error:', err.message);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * POST /api/auth/register
 *
 * Gate: blocked in production unless ALLOW_REGISTRATION=true is explicitly set.
 *
 * Deployment pattern:
 *   1. Deploy with NODE_ENV=production (no ALLOW_REGISTRATION)
 *   2. To create the first admin: set ALLOW_REGISTRATION=true, restart, POST /register
 *   3. Immediately unset ALLOW_REGISTRATION and restart — route is locked again
 */
router.post(
  '/register',
  (req, res, next) => {
    const isProduction      = process.env.NODE_ENV === 'production';
    const registrationOpen  = process.env.ALLOW_REGISTRATION === 'true';

    if (isProduction && !registrationOpen) {
      return res.status(403).json({
        success: false,
        error: 'Registration disabled in production. Set ALLOW_REGISTRATION=true to enable temporarily.',
      });
    }
    next();
  },
  registerHandler
);

export default router;
