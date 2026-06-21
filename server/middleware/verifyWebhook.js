import crypto from 'crypto';

/**
 * Verifies GitHub's HMAC-SHA256 webhook signature.
 * GitHub sends: X-Hub-Signature-256: sha256=<hex>
 * Must use express.raw() on the route so req.body is a Buffer.
 */
export default function verifyWebhook(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing webhook signature' });
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const hmac   = crypto.createHmac('sha256', secret);
  hmac.update(req.body); // req.body is a raw Buffer here
  const digest = `sha256=${hmac.digest('hex')}`;

  // Constant-time comparison to prevent timing attacks
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch {
    // Buffers of different length throw — means invalid
    valid = false;
  }

  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }

  next();
}
