import { fetchPRFiles, fetchPRMeta } from './diffParser.js';
import { askAI, askForSummary }      from './ai.js';
import { postReview }                from './commentPoster.js';
import Review                        from '../models/Review.js';

const CHUNK_SIZE = 6000;
const sleep      = (ms) => new Promise((r) => setTimeout(r, ms));

function chunkPatch(patch) {
  if (patch.length <= CHUNK_SIZE) return [patch];
  const chunks = [];
  let i = 0;
  while (i < patch.length) {
    chunks.push(patch.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE;
  }
  return chunks;
}

function deduplicateComments(comments) {
  const seen = new Set();
  return comments.filter((c) => {
    const key = `${c.path}:${c.line}:${c.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Main orchestrator — full pipeline for reviewing a single PR.
 *
 * Pipeline:
 *  1. Fetch PR metadata
 *  2. Fetch + filter changed files
 *  3. Per-file AI review (chunked, 500ms inter-call delay)
 *  4. Deduplicate comments
 *  5. Generate PR-level summary + verdict  ← NEW
 *  6. Post GitHub review (inline + summary body + event from verdict)
 *  7. Save everything to MongoDB
 */
export async function reviewPR(owner, repo, prNumber, customToken = null) {
  const fullRepo = `${owner}/${repo}`;
  console.log(`\n🔍 Starting review for ${fullRepo}#${prNumber}`);

  let reviewDoc = await Review.create({
    repo:     fullRepo,
    prNumber,
    headSha:  'pending',
    status:   'pending',
  });

  try {
    // 1. PR metadata
    const meta = await fetchPRMeta(owner, repo, prNumber, customToken);
    reviewDoc.prTitle = meta.title;
    reviewDoc.author  = meta.author;
    reviewDoc.headSha = meta.headSha;
    await reviewDoc.save();

    // 2. Fetch files
    const prFiles = await fetchPRFiles(owner, repo, prNumber, customToken);
    if (!prFiles.length) {
      console.log('No reviewable files found — skipping.');
      reviewDoc.status = 'completed';
      await reviewDoc.save();
      return;
    }
    console.log(`  Found ${prFiles.length} file(s) to review`);

    // 3. Per-file inline review
    const allComments = [];
    for (let fileIdx = 0; fileIdx < prFiles.length; fileIdx++) {
      const file   = prFiles[fileIdx];
      const chunks = chunkPatch(file.patch);

      for (let i = 0; i < chunks.length; i++) {
        const chunkLabel = chunks.length > 1 ? ` (chunk ${i + 1}/${chunks.length})` : '';
        console.log(`  Reviewing ${file.filename}${chunkLabel}...`);

        const comments = await askAI(buildReviewPrompt(file.filename, chunks[i]));
        for (const c of comments) {
          if (!c.path) c.path = file.filename;
          allComments.push(c);
        }

        const isLastCall = fileIdx === prFiles.length - 1 && i === chunks.length - 1;
        if (!isLastCall) await sleep(500);
      }
    }

    // 4. Deduplicate
    const deduped = deduplicateComments(allComments);
    console.log(`  Unique inline comments: ${deduped.length}`);

    // 5. Generate PR-level summary + verdict
    console.log('  Generating PR summary...');
    const fileList = prFiles.map((f) => f.filename);
    const summary  = await askForSummary(fileList, deduped);

    if (summary) {
      console.log(`  Verdict: ${summary.verdict} | Risk: ${summary.riskLevel}`);
    }

    // 6. Post GitHub review (inline comments + summary body + verdict event)
    await postReview(owner, repo, prNumber, meta.headSha, deduped, prFiles, summary, customToken);

    // 7. Save to MongoDB
    reviewDoc.comments  = deduped;
    reviewDoc.summary   = summary?.summary   ?? null;
    reviewDoc.verdict   = summary?.verdict   ?? null;
    reviewDoc.riskLevel = summary?.riskLevel ?? null;
    reviewDoc.status    = 'completed';
    await reviewDoc.save();

    console.log(`✅ Review complete for ${fullRepo}#${prNumber}`);
  } catch (err) {
    console.error(`❌ Review failed for ${fullRepo}#${prNumber}:`, err.message);
    reviewDoc.status = 'failed';
    await reviewDoc.save();
  }
}

function buildReviewPrompt(filename, patch) {
  return `Review the following git diff for the file \`${filename}\`.

File: ${filename}
Diff:
\`\`\`diff
${patch}
\`\`\`

Report only real, actionable issues (bugs, security vulnerabilities, performance problems).
Line numbers should be relative to the new version of the file.
For bug and security issues, include a suggested_fix with the corrected replacement code.
Return your response as valid JSON only.`;
}
