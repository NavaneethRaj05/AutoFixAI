import { Router } from 'express';
import Review         from '../models/Review.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { reviewPR }   from '../services/aiReview.js';
import { auditRepo }  from '../services/repoAudit.js';
import Groq           from 'groq-sdk';

const router = Router();

// All review routes require authentication
router.use(authMiddleware);

/**
 * GET /api/reviews
 * Paginated list with optional repo/severity filters.
 */
router.get('/', async (req, res) => {
  try {
    const { repo, severity, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (repo)     filter.repo = new RegExp(repo, 'i');
    if (severity) filter['comments.severity'] = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Review.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          page:       parseInt(page),
          limit:      parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    console.error('GET /api/reviews error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
});

/**
 * GET /api/reviews/stats
 * Aggregate counts for the dashboard stats bar.
 */
router.get('/stats', async (req, res) => {
  try {
    const [totalReviews, severityCounts, topRepos] = await Promise.all([
      Review.countDocuments({ status: 'completed' }),

      Review.aggregate([
        { $unwind: '$comments' },
        { $group: { _id: '$comments.severity', count: { $sum: 1 } } },
      ]),

      Review.aggregate([
        { $unwind: '$comments' },
        { $group: { _id: '$repo', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const bySeverity = { bug: 0, security: 0, performance: 0, style: 0, suggestion: 0 };
    for (const { _id, count } of severityCounts) {
      if (_id in bySeverity) bySeverity[_id] = count;
    }

    res.json({ success: true, data: { totalReviews, bySeverity, topRepos } });
  } catch (err) {
    console.error('GET /api/reviews/stats error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/reviews/stats/trend
 *
 * Returns daily issue counts broken down by severity for the last N days.
 * Used by the Dashboard severity trend chart (Recharts LineChart).
 *
 * Response shape:
 * [
 *   { date: "2024-06-01", bug: 3, security: 1, performance: 2, style: 0, suggestion: 1 },
 *   ...
 * ]
 *
 * Query params:
 *   - days (number, default 30) — how many days to look back
 */
router.get('/stats/trend', async (req, res) => {
  try {
    const days  = Math.min(parseInt(req.query.days) || 30, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const raw = await Review.aggregate([
      // Only completed reviews in the window
      { $match: { status: 'completed', createdAt: { $gte: since } } },
      // Flatten comments
      { $unwind: '$comments' },
      // Group by date (YYYY-MM-DD) × severity
      {
        $group: {
          _id: {
            date:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            severity: '$comments.severity',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Pivot into { date, bug, security, performance, style, suggestion }
    const byDate = {};
    for (const row of raw) {
      const { date, severity } = row._id;
      if (!byDate[date]) {
        byDate[date] = { date, bug: 0, security: 0, performance: 0, style: 0, suggestion: 0 };
      }
      if (severity in byDate[date]) {
        byDate[date][severity] = row.count;
      }
    }

    const trend = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, data: trend });
  } catch (err) {
    console.error('GET /api/reviews/stats/trend error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch trend data' });
  }
});

/**
 * GET /api/reviews/leaderboard
 *
 * Aggregates issues per author across all completed reviews.
 * Returns authors ranked by critical issue count (bug + security).
 *
 * Quality Score (0–100):
 *   100 base − (5 × bugs) − (10 × security) − (2 × performance) − (1 × style)
 *   Clamped to [0, 100]
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const raw = await Review.aggregate([
      { $match: { status: 'completed' } },
      { $unwind: '$comments' },
      {
        $group: {
          _id: { author: '$author', severity: '$comments.severity' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.author',
          bug: {
            $sum: { $cond: [{ $eq: ['$_id.severity', 'bug'] }, '$count', 0] },
          },
          security: {
            $sum: { $cond: [{ $eq: ['$_id.severity', 'security'] }, '$count', 0] },
          },
          performance: {
            $sum: { $cond: [{ $eq: ['$_id.severity', 'performance'] }, '$count', 0] },
          },
          style: {
            $sum: { $cond: [{ $eq: ['$_id.severity', 'style'] }, '$count', 0] },
          },
          suggestion: {
            $sum: { $cond: [{ $eq: ['$_id.severity', 'suggestion'] }, '$count', 0] },
          },
          total: { $sum: '$count' },
        },
      },
    ]);

    // Attach quality score, sort by score descending
    const leaderboard = raw
      .filter((r) => r._id && r._id !== 'unknown')
      .map((r) => ({
        author:      r._id,
        bug:         r.bug,
        security:    r.security,
        performance: r.performance,
        style:       r.style,
        suggestion:  r.suggestion,
        total:       r.total,
        score:       Math.max(0, 100 - (r.bug * 5) - (r.security * 10) - (r.performance * 2) - (r.style * 1)),
      }))
      .sort((a, b) => b.score - a.score);

    res.json({ success: true, data: leaderboard });
  } catch (err) {
    console.error('GET /api/reviews/leaderboard error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
});

/**
 * GET /api/reviews/weekly-report
 *
 * Generates an AI narrative from current author stats.
 * Calling this endpoint triggers a fresh Groq call — results are not cached.
 *
 * Returns:
 *   { headline, insights[], recommendations[], generatedAt }
 */
router.get('/weekly-report', async (req, res) => {
  try {
    // Reuse the leaderboard aggregation
    const raw = await Review.aggregate([
      { $match: { status: 'completed' } },
      { $unwind: '$comments' },
      { $group: { _id: { author: '$author', severity: '$comments.severity' }, count: { $sum: 1 } } },
      {
        $group: {
          _id: '$_id.author',
          bug:         { $sum: { $cond: [{ $eq: ['$_id.severity', 'bug'] },         '$count', 0] } },
          security:    { $sum: { $cond: [{ $eq: ['$_id.severity', 'security'] },    '$count', 0] } },
          performance: { $sum: { $cond: [{ $eq: ['$_id.severity', 'performance'] }, '$count', 0] } },
          total:       { $sum: '$count' },
        },
      },
    ]);

    const authorStats = raw
      .filter((r) => r._id && r._id !== 'unknown')
      .map((r) => ({ author: r._id, bug: r.bug, security: r.security, performance: r.performance, total: r.total,
        score: Math.max(0, 100 - r.bug * 5 - r.security * 10 - r.performance * 2) }));

    if (!authorStats.length) {
      return res.json({
        success: true,
        data: {
          headline:        'No review data yet.',
          insights:        [],
          recommendations: [],
          generatedAt:     new Date().toISOString(),
        },
      });
    }

    const prompt = `Given these developer code quality stats from an AI code reviewer:

${JSON.stringify(authorStats, null, 2)}

Write a concise weekly team code health summary.
Highlight: most improved, areas of concern, team-wide patterns.
Return JSON with exactly this shape:
{
  "headline": "one-sentence team summary",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "recommendations": ["action 1", "action 2"]
}`;

    // Direct Groq call with report-specific prompt
    const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const response   = await groqClient.chat.completions.create({
      model:           'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages:        [{ role: 'user', content: prompt }],
      temperature:     0.3,
      max_tokens:      1024,
    });

    let report;
    try {
      report = JSON.parse(response.choices[0].message.content);
    } catch {
      report = { headline: 'Report generation failed.', insights: [], recommendations: [] };
    }

    res.json({
      success: true,
      data: { ...report, generatedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error('GET /api/reviews/weekly-report error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate weekly report' });
  }
});

/**
 * POST /api/reviews/run-custom
 * Triggers a custom PR review on the fly, optionally using a user-supplied GITHUB_TOKEN (PAT).
 * Awaits the review completion and returns the final Review document.
 */
router.post('/run-custom', async (req, res) => {
  try {
    const { repoUrl, prNumber, githubToken } = req.body;

    if (!repoUrl || !prNumber) {
      return res.status(400).json({ success: false, error: 'Repository (URL or owner/repo) and PR number are required' });
    }

    // Parse repoUrl: e.g. "https://github.com/owner/repo" or "owner/repo" or "https://github.com/owner/repo/pull/1"
    let cleanRepo = repoUrl.trim();
    if (cleanRepo.startsWith('http://') || cleanRepo.startsWith('https://')) {
      const parts = cleanRepo.split('github.com/');
      if (parts.length > 1) {
        cleanRepo = parts[1];
      }
    }
    // Remove trailing pull info if present
    cleanRepo = cleanRepo.split('/pull/')[0];
    cleanRepo = cleanRepo.replace(/\/$/, '');

    const [owner, repo] = cleanRepo.split('/');
    if (!owner || !repo) {
      return res.status(400).json({ success: false, error: 'Invalid repository format. Use owner/repo or a full GitHub URL.' });
    }

    const prNum = parseInt(prNumber, 10);
    if (isNaN(prNum)) {
      return res.status(400).json({ success: false, error: 'PR number must be a valid number.' });
    }

    console.log(`🚀 Custom PR review request received for ${owner}/${repo}#${prNum}`);

    const tokenToUse = githubToken ? githubToken.trim() : null;
    
    // We execute the review
    await reviewPR(owner, repo, prNum, tokenToUse);

    // Fetch the newly created review document
    const finalReview = await Review.findOne({ repo: `${owner}/${repo}`, prNumber: prNum }).sort({ createdAt: -1 });

    if (!finalReview) {
      return res.status(500).json({ success: false, error: 'Review completed but document could not be retrieved.' });
    }

    if (finalReview.status === 'failed') {
      return res.status(500).json({ success: false, error: 'AI review failed. Please ensure the repository is public or you provided a valid GitHub token with repo access.' });
    }

    res.json({ success: true, data: finalReview });

  } catch (err) {
    console.error('POST /api/reviews/run-custom error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to execute custom review' });
  }
});

/**
 * POST /api/reviews/audit-repo
 * Runs an autonomous audit on a codebase's main branch, auto-commits bug fixes, and creates a PR on GitHub.
 */
router.post('/audit-repo', async (req, res) => {
  try {
    const { repoUrl, githubToken } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ success: false, error: 'Repository URL is required.' });
    }

    if (!githubToken) {
      return res.status(400).json({ success: false, error: 'A valid GitHub Personal Access Token (PAT) with write access is required to run the Autonomous Agent.' });
    }

    // Parse repoUrl: e.g. "https://github.com/owner/repo" or "owner/repo"
    let cleanRepo = repoUrl.trim();
    if (cleanRepo.startsWith('http://') || cleanRepo.startsWith('https://')) {
      const parts = cleanRepo.split('github.com/');
      if (parts.length > 1) {
        cleanRepo = parts[1];
      }
    }
    cleanRepo = cleanRepo.split('/pull/')[0];
    cleanRepo = cleanRepo.replace(/\/$/, '');

    const [owner, repo] = cleanRepo.split('/');
    if (!owner || !repo) {
      return res.status(400).json({ success: false, error: 'Invalid repository format. Use owner/repo or a full GitHub URL.' });
    }

    console.log(`🚀 Autonomous codebase audit requested for ${owner}/${repo}`);

    const result = await auditRepo(owner, repo, githubToken.trim());
    res.json({ success: true, data: result });

  } catch (err) {
    console.error('POST /api/reviews/audit-repo error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to execute codebase audit agent loop' });
  }
});

/**
 * GET /api/reviews/:id
 * Single review with full comment list.
 */
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id).lean();
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    res.json({ success: true, data: review });
  } catch (err) {
    console.error('GET /api/reviews/:id error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch review' });
  }
});

/**
 * POST /api/reviews/:id/rerun
 *
 * Re-triggers the AI review pipeline for an existing review record.
 * Useful for demos and retries without needing to open a new PR.
 *
 * Flow:
 *  1. Find the existing review to get repo + prNumber
 *  2. Reset status to 'pending'
 *  3. Respond 202 Accepted immediately
 *  4. Fire-and-forget: reviewPR() (same pipeline as the webhook handler)
 */
router.post('/:id/rerun', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }

    // repo is stored as "owner/repo"
    const [owner, repo] = review.repo.split('/');
    if (!owner || !repo) {
      return res.status(400).json({ success: false, error: `Invalid repo format: ${review.repo}` });
    }

    // Reset to pending so the UI reflects the in-progress state
    review.status = 'pending';
    await review.save();

    // Respond before doing any async work
    res.status(202).json({
      success: true,
      data: { message: `Re-run triggered for ${review.repo}#${review.prNumber}` },
    });

    // Fire-and-forget
    reviewPR(owner, repo, review.prNumber).catch((err) => {
      console.error(`Re-run failed for ${review.repo}#${review.prNumber}:`, err.message);
    });

  } catch (err) {
    console.error('POST /api/reviews/:id/rerun error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to trigger re-run' });
  }
});

export default router;
