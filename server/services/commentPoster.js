import { getOctokit } from './githubClient.js';

// ── Diff position mapper ──────────────────────────────────────────────────────
function getDiffPosition(patch, aiLine) {
  if (!patch || typeof aiLine !== 'number') return null;
  const lines      = patch.split('\n');
  let position     = 0;
  let newLineCount = 0;

  for (const line of lines) {
    position++;
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) newLineCount = parseInt(match[1], 10) - 1;
      continue;
    }
    if (!line.startsWith('-')) newLineCount++;
    if (!line.startsWith('-') && newLineCount === aiLine) return position;
  }
  return null;
}

// ── Comment formatter ─────────────────────────────────────────────────────────
const EMOJI = { bug: '🐛', security: '🔐', performance: '⚡', style: '✨', suggestion: '💡' };

/**
 * Formats a comment body string.
 *
 * For bug + security severity: appends a GitHub ```suggestion block if the AI
 * provided a suggested_fix. GitHub renders this as a one-click applicable patch —
 * the same mechanism used by CodeRabbit and GitHub Copilot.
 */
function formatComment(c) {
  const emoji = EMOJI[c.severity] ?? '💬';
  let body    = `${emoji} **[${(c.severity || 'note').toUpperCase()}]** ${c.comment}`;

  if (c.suggestedFix && ['bug', 'security'].includes(c.severity)) {
    body += `\n\n\`\`\`suggestion\n${c.suggestedFix}\n\`\`\``;
  }

  return body;
}

// ── Verdict → GitHub review event ────────────────────────────────────────────
function verdictToEvent(verdict) {
  if (verdict === 'APPROVE')         return 'APPROVE';
  if (verdict === 'REQUEST_CHANGES') return 'REQUEST_CHANGES';
  if (verdict === 'CRITICAL_ISSUES') return 'REQUEST_CHANGES';
  return 'COMMENT'; // no summary or unknown verdict
}

// ── Risk badge for the review body ───────────────────────────────────────────
function riskBadge(riskLevel) {
  const map = {
    low:      '🟢 **Low**',
    medium:   '🟡 **Medium**',
    high:     '🟠 **High**',
    critical: '🔴 **Critical**',
  };
  return map[riskLevel] ?? '⚪ Unknown';
}

/**
 * Posts a complete PR review in a single Octokit call.
 *
 * New in this version:
 *  - Review body now contains the AI-generated PR summary (3 paragraphs)
 *  - GitHub review event is driven by the AI's verdict (APPROVE / REQUEST_CHANGES)
 *  - bug/security inline comments include ```suggestion blocks for one-click fixes
 *  - Unmappable comments fall back to the review body (nothing dropped)
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @param {string} headSha
 * @param {Array<{ path, line, severity, comment, suggestedFix? }>} aiComments
 * @param {Array<{ filename, patch }>} prFiles
 * @param {{ summary, verdict, riskLevel }|null} summary - from askForSummary()
 */
export async function postReview(owner, repo, prNumber, headSha, aiComments, prFiles, summary = null, customToken = null) {
  // Build filename → patch lookup
  const patchMap = {};
  for (const f of prFiles) patchMap[f.filename] = f.patch;

  const inlineComments = [];
  const fallbackBodies = [];

  for (const c of aiComments) {
    const position = getDiffPosition(patchMap[c.path], c.line);

    if (position !== null) {
      inlineComments.push({ path: c.path, position, body: formatComment(c) });
    } else {
      console.warn(`  Falling back to PR-level (line ${c.line} in ${c.path})`);
      fallbackBodies.push(
        `> **\`${c.path}\`** — line ${c.line} *(inline position unavailable)*\n>\n> ${formatComment(c)}`
      );
    }
  }

  // ── Build review body ─────────────────────────────────────────────────────
  let reviewBody = '';

  if (summary?.summary) {
    // Verdict header
    const verdictLabel = {
      APPROVE:          '✅ APPROVE',
      REQUEST_CHANGES:  '🔄 REQUEST CHANGES',
      CRITICAL_ISSUES:  '🚨 CRITICAL ISSUES',
    }[summary.verdict] ?? '💬 REVIEWED';

    reviewBody =
      `## 🤖 AI Code Review — ${verdictLabel}\n\n` +
      `**Risk Level:** ${riskBadge(summary.riskLevel)}\n\n` +
      `---\n\n` +
      `${summary.summary}\n\n` +
      `---\n\n` +
      `**${inlineComments.length}** inline comment(s) · ` +
      `**${fallbackBodies.length}** PR-level fallback(s)`;
  } else {
    // No summary — minimal header
    reviewBody =
      `🤖 **AI Code Review** — ` +
      `${inlineComments.length} inline, ${fallbackBodies.length} PR-level comment(s)`;
  }

  // Append fallback comments to body
  if (fallbackBodies.length > 0) {
    reviewBody += `\n\n---\n\n### ⚠️ ${fallbackBodies.length} comment(s) could not be pinned inline\n\n`;
    reviewBody += fallbackBodies.join('\n\n---\n\n');
  }

  // ── Single Octokit call ───────────────────────────────────────────────────
  const event = verdictToEvent(summary?.verdict);

  const octokit = getOctokit(customToken);
  try {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id:   headSha,
      event,
      body:        reviewBody,
      comments:    inlineComments,
    });

    console.log(
      `✅ Posted ${event} review on ${owner}/${repo}#${prNumber}: ` +
      `${inlineComments.length} inline + ${fallbackBodies.length} PR-level`
    );
  } catch (err) {
    console.error('Failed to post GitHub review:', err.message);
    throw err;
  }
}
