import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Load .env from the project root (one level above server/)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

// ── Startup validation ────────────────────────────────────────────────────────
// Required at startup (GitHub token is optional — only needed when a review runs)
const REQUIRED_ENV = [
  'GROQ_API_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'MONGO_URI',
  'JWT_SECRET',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`❌ Missing required env var: ${key}`);
  }
  console.log(`  ${key}: ${process.env[key] ? 'set ✓' : 'MISSING ✗'}`);
}

// ── Routes ────────────────────────────────────────────────────────────────────
import webhookRouter from './routes/webhook.js';
import reviewsRouter from './routes/reviews.js';
import authRouter    from './routes/auth.js';
import { seedDemoData } from './services/seeder.js';

const app  = express();
const PORT = process.env.PORT || 5000;

// CORS — only allow the configured frontend origin
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Raw body for webhook (MUST come before express.json()) ────────────────────
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// ── JSON body for all other routes ───────────────────────────────────────────
app.use(express.json());

// ── Sanitization Middleware (removes sensitive usernames, repos, and names) ──
function sanitizeResponse(val) {
  try {
    const plain = JSON.parse(JSON.stringify(val));
    return doSanitize(plain);
  } catch (err) {
    return doSanitize(val);
  }
}

function doSanitize(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return val
      .replace(/NavaneethRaj05\/PrismFlow/gi, 'autofixai/core')
      .replace(/NavaneethRaj05/gi, 'dev-user')
      .replace(/Navaneeth/gi, 'dev-user')
      .replace(/aksha/gi, 'anonymous-user')
      .replace(/teamvortexnce\/prism/gi, 'autofixai/core')
      .replace(/teamvortexnce/gi, 'autofixai-team')
      .replace(/teamvortex/gi, 'autofixai-team');
  }
  if (Array.isArray(val)) {
    return val.map(doSanitize);
  }
  if (typeof val === 'object') {
    const copy = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        copy[key] = doSanitize(val[key]);
      }
    }
    return copy;
  }
  return val;
}

app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    try {
      const sanitized = sanitizeResponse(body);
      return originalJson.call(this, sanitized);
    } catch (err) {
      return originalJson.call(this, body);
    }
  };
  next();
});

// ── Mount routers ─────────────────────────────────────────────────────────────
app.use('/api/webhook', webhookRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/auth',    authRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Database + listen ─────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    
    // Seed demo reviews if collection is empty
    await seedDemoData();

    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

export default app;
