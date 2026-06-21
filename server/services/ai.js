import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _groq = null;
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set in .env');
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

// ── Prompt 1: Per-file inline code review ────────────────────────────────────
const REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer with deep knowledge of security, performance, and software engineering best practices.

Return ONLY valid JSON — no markdown fences, no preamble.

Format:
{
  "comments": [
    {
      "path": "relative/file/path.js",
      "line": 42,
      "severity": "bug",
      "comment": "Clear, actionable description of the issue and how to fix it.",
      "suggested_fix": "corrected replacement code (ONLY for bug or security)"
    }
  ]
}

Severity values (use exactly one):
- "bug"         — logic error, crash risk, incorrect behavior
- "security"    — injection, auth bypass, secret exposure, timing attacks
- "performance" — N+1 queries, memory leaks, unnecessary re-renders
- "style"       — naming, readability (only flag egregious issues)
- "suggestion"  — optional improvements, refactoring opportunities

Rules:
- Line numbers must be relative to the new version of the file, NOT the diff hunk
- For "bug" and "security" severity ONLY: include "suggested_fix" with the corrected
  replacement lines (no diff markers, no surrounding context, just the corrected code).
  The suggested_fix will be rendered as a GitHub one-click suggestion block.
- For all other severities: omit "suggested_fix" entirely
- Only flag actionable, meaningful issues — never whitespace or minor formatting
- If there are no issues, return { "comments": [] }
- Never include code fences or text outside the JSON object`;

// ── Prompt 2: PR-level summary after all files reviewed ──────────────────────
const SUMMARY_SYSTEM_PROMPT = `You are a senior engineering lead writing a PR review summary for your team.
You have just reviewed all changed files and collected specific issues.

Return ONLY valid JSON with this exact shape — no markdown, no preamble:
{
  "summary": "Three paragraphs separated by \\n\\n: (1) what this PR does and its purpose, (2) key risks or concerns found during review, (3) final verdict with clear rationale",
  "verdict": "APPROVE | REQUEST_CHANGES | CRITICAL_ISSUES",
  "risk_level": "low | medium | high | critical"
}

Verdict guide:
- APPROVE           — No significant issues, the PR is safe to merge
- REQUEST_CHANGES   — Has real issues that must be addressed before merging
- CRITICAL_ISSUES   — Has security vulnerabilities or crashes that block merging immediately

Be specific. Cite file names and patterns. Don't be vague.`;

// ── Internal helper: one Groq call with retry ────────────────────────────────
async function callGroq(systemPrompt, userPrompt, retries = 3) {
  const groq = getGroq();
  for (let i = 0; i < retries; i++) {
    try {
      const response = await groq.chat.completions.create({
        model:           MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens:  2048,
      });

      const raw = response.choices[0]?.message?.content ?? '{}';

      try {
        return JSON.parse(raw);
      } catch {
        console.error('Groq returned non-JSON:', raw.slice(0, 200));
        return null;
      }
    } catch (err) {
      if (err?.status === 429 && i < retries - 1) {
        const wait = Math.pow(2, i) * 1000;
        console.log(`Rate limited by Groq. Retrying in ${wait}ms... (attempt ${i + 1}/${retries})`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

/**
 * Per-file inline code review. Returns an array of comment objects.
 * Each bug/security comment may include a `suggested_fix` field.
 */
export async function askAI(userPrompt, retries = 3) {
  const parsed = await callGroq(REVIEW_SYSTEM_PROMPT, userPrompt, retries);
  if (!parsed) return [];

  const comments = Array.isArray(parsed)
    ? parsed
    : (parsed.comments ?? parsed.issues ?? []);

  return Array.isArray(comments) ? comments : [];
}

/**
 * PR-level summary generator — called once after all inline comments are collected.
 *
 * @param {string[]} fileList     - Array of changed filenames
 * @param {Object[]} allComments  - All deduplicated inline comments
 * @returns {Promise<{ summary, verdict, risk_level }|null>}
 */
export async function askForSummary(fileList, allComments, retries = 3) {
  const issueBreakdown = allComments.length
    ? `${allComments.length} issue(s) found:\n${JSON.stringify(allComments, null, 2)}`
    : 'No specific issues were flagged by the inline review.';

  const userPrompt = `PR Review Results:

Files changed (${fileList.length}): ${fileList.join(', ')}

${issueBreakdown}

Write a 3-paragraph PR summary as instructed.`;

  const parsed = await callGroq(SUMMARY_SYSTEM_PROMPT, userPrompt, retries);

  // Validate shape
  if (!parsed?.verdict || !parsed?.summary) {
    console.warn('Summary response missing required fields:', parsed);
    return null;
  }

  return {
    summary:   parsed.summary,
    verdict:   parsed.verdict,
    riskLevel: parsed.risk_level ?? 'medium',
  };
}
