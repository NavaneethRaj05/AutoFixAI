import Review from '../models/Review.js';

export async function seedDemoData() {
  try {
    const count = await Review.countDocuments();
    if (count > 0) {
      console.log('  Database seeder: reviews found, skipping seed.');
      return;
    }

    console.log('🌱 Database seeder: no reviews found. Seeding demo data...');

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const mockReviews = [
      {
        repo: 'teamvortexnce/prism',
        prNumber: 104,
        prTitle: 'auth: add OAuth2 login and cookie storage',
        headSha: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
        author: 'alex_coder',
        status: 'completed',
        verdict: 'REQUEST_CHANGES',
        riskLevel: 'high',
        summary: 'The PR adds OAuth2 authentication flow and stores tokens in cookies. However, there are serious security concerns around storing secrets in plain-text, exposing credentials in stdout console.log statements, and a missing error handler on the login callback endpoint.',
        comments: [
          {
            path: 'server/config/oauth.js',
            line: 12,
            severity: 'security',
            comment: 'SECURITY WARNING: Hardcoded client secret detected. Use process.env.OAUTH_CLIENT_SECRET instead of storing sensitive API credentials directly in git.',
            suggestedFix: 'const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;'
          },
          {
            path: 'server/routes/oauth.js',
            line: 45,
            severity: 'bug',
            comment: "A try/catch block is missing here, which can lead to unhandled promise rejections crashing the Node process if the provider's token exchange fails.",
            suggestedFix: 'try {\n  const token = await exchangeToken(code);\n} catch (err) {\n  console.error("Token exchange failed:", err.message);\n  return res.status(500).json({ error: "Auth failed" });\n}'
          },
          {
            path: 'client/src/components/LoginButton.jsx',
            line: 8,
            severity: 'style',
            comment: "Unused imports of 'useState' and 'useEffect'. Keeping code clean prevents bundle size bloat.",
            suggestedFix: "import React from 'react';"
          }
        ],
        createdAt: new Date(now - 5 * oneDay),
        updatedAt: new Date(now - 5 * oneDay)
      },
      {
        repo: 'teamvortexnce/prism',
        prNumber: 108,
        prTitle: 'perf: refactor DB querying using index hints',
        headSha: 'f1e2d3c4b5a69878a9b0c1d2e3f4a5b6c7d8e9f0',
        author: 'sarah_backend',
        status: 'completed',
        verdict: 'APPROVE',
        riskLevel: 'low',
        summary: 'Refactored key database lookup routes to utilize newly created Mongoose indexes and added lean() to query chains. This significantly reduces heap allocations and query response latency by bypassing Mongoose document wrapping.',
        comments: [
          {
            path: 'server/routes/reviews.js',
            line: 18,
            severity: 'performance',
            comment: 'Excellent optimization using .lean(). This improves speed by 4x for read-heavy operations.',
            suggestedFix: null
          },
          {
            path: 'server/models/Review.js',
            line: 47,
            severity: 'suggestion',
            comment: 'Consider adding a compound index on { repo: 1, prNumber: -1 } to speed up list queries where newest PR reviews are retrieved first.',
            suggestedFix: 'reviewSchema.index({ repo: 1, prNumber: -1 });'
          }
        ],
        createdAt: new Date(now - 3 * oneDay),
        updatedAt: new Date(now - 3 * oneDay)
      },
      {
        repo: 'web-apps/dashboard',
        prNumber: 42,
        prTitle: 'fix: useEffect infinite dependency loop on stats reload',
        headSha: '9876543210abcdef9876543210abcdef98765432',
        author: 'dan_abramov',
        status: 'completed',
        verdict: 'APPROVE',
        riskLevel: 'low',
        summary: 'Fixes an infinite re-render loop by wrapping the refresh function in useCallback and properly declaring it in the useEffect dependency array.',
        comments: [
          {
            path: 'client/src/components/DashboardStats.jsx',
            line: 32,
            severity: 'bug',
            comment: 'Fixed infinite render loop. The fetchStats function was recreated on every render causing useEffect to execute continuously.',
            suggestedFix: 'const fetchStats = useCallback(() => {\n  api.get("/reviews/stats").then(res => setStats(res.data.data));\n}, []);'
          }
        ],
        createdAt: new Date(now - 1 * oneDay),
        updatedAt: new Date(now - 1 * oneDay)
      },
      {
        repo: 'teamvortexnce/prism',
        prNumber: 110,
        prTitle: 'feature: add PR summary generator on webhooks',
        headSha: '2468101214161820222426283032343638404244',
        author: 'lucas_dev',
        status: 'completed',
        verdict: 'APPROVE',
        riskLevel: 'low',
        summary: 'Implements the automated PR summary generation triggered by the GitHub webhook. The summary is posted directly back to the pull request in markdown format alongside the inline feedback comments.',
        comments: [
          {
            path: 'server/services/aiReview.js',
            line: 142,
            severity: 'suggestion',
            comment: 'Consider handling cases where a PR has no files or the files are binary only, so we dont send empty requests to the AI model.',
            suggestedFix: 'if (files.length === 0) return;'
          }
        ],
        createdAt: new Date(now),
        updatedAt: new Date(now)
      }
    ];

    await Review.insertMany(mockReviews);
    console.log('✅ Demo reviews successfully seeded!');
  } catch (err) {
    console.error('❌ Failed to seed database:', err.message);
  }
}
