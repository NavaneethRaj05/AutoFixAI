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

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`❌ Missing required env vars: ${missingEnv.join(', ')}`);
} else {
  for (const key of REQUIRED_ENV) {
    console.log(`  ${key}: set ✓`);
  }
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

// ── Block requests if environment configuration is invalid ───────────────────
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (missingEnv.length > 0) {
    return res.status(500).json({
      success: false,
      error: `Server configuration error: Missing required environment variables: ${missingEnv.join(', ')}. Please configure these in your Vercel Project Settings.`
    });
  }
  next();
});

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

// ── Database connection helper & middleware ───────────────────────────────────
let cachedConnection = null;
async function connectToDatabase() {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }
  console.log('📡 Connecting to MongoDB...');
  cachedConnection = await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB connected');
  await seedDemoData();
  return cachedConnection;
}

// Middleware to ensure DB connection is active before routes are processed
app.use(async (req, res, next) => {
  if (req.path === '/health') return next();
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    return res.status(500).json({
      success: false,
      error: `Database connection failed: ${err.message}. Please check your MONGO_URI and verify that access from anywhere (0.0.0.0/0) is allowed in your MongoDB Atlas network security settings.`
    });
  }
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

// ── Startup & listen ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  connectToDatabase()
    .then(() => {
      app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
    })
    .catch((err) => {
      console.error('❌ MongoDB initial connection failed:', err.message);
    });
}

export default app;
