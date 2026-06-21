import { Router } from 'express';
import verifyWebhook from '../middleware/verifyWebhook.js';
import { reviewPR }  from '../services/aiReview.js';

const router = Router();

/**
 * POST /api/webhook/github
 *
 * Receives GitHub pull_request events.
 * Body must be raw Buffer (express.raw is applied in server.js).
 *
 * Flow:
 *  1. Verify HMAC-SHA256 signature
 *  2. Parse raw body to JSON
 *  3. Ignore non pull_request events
 *  4. Respond 200 immediately
 *  5. Fire-and-forget: call reviewPR()
 */
router.post('/github', verifyWebhook, (req, res) => {
  // Parse the raw buffer to JSON
  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
  }

  const event  = req.headers['x-github-event'];
  const action = payload.action;

  // Only handle pull_request open/sync events
  if (event !== 'pull_request' || !['opened', 'synchronize'].includes(action)) {
    return res.sendStatus(200);
  }

  const { number: prNumber, pull_request: pr, repository } = payload;
  const owner = repository.owner.login;
  const repo  = repository.name;

  // Respond to GitHub IMMEDIATELY before any async work
  res.sendStatus(200);

  // Fire-and-forget — do not await
  reviewPR(owner, repo, prNumber).catch((err) => {
    console.error(`Background review failed for ${owner}/${repo}#${prNumber}:`, err.message);
  });
});

export default router;
