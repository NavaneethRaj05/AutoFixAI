import { getOctokit } from './githubClient.js';
import Review from '../models/Review.js';
import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';

const AUDIT_SYSTEM_PROMPT = `You are an expert AI software engineer. You will scan the provided file content for bugs, security vulnerabilities, or performance issues.
If you find issues:
1. Provide a list of comments with line number, severity ("bug", "security", "performance", "style", "suggestion"), description of the issue, and suggestedFix (optional replacement code).
2. Provide the ENTIRE updated file content with the fixes applied. Do NOT truncate, do not use ellipses, and do not include comment placeholder wrappers. It must be a complete drop-in replacement.

Return your response in valid JSON ONLY (no markdown fences, no text outside the JSON).
Format:
{
  "issuesFound": true,
  "comments": [
    {
      "line": 42,
      "severity": "security",
      "comment": "Description of vulnerability...",
      "suggestedFix": "corrected replacement code"
    }
  ],
  "fixedContent": "full updated file content..."
}

If no issues are found, return:
{
  "issuesFound": false,
  "comments": [],
  "fixedContent": null
}`;

/**
 * Autonomous Repo Agent Loop
 */
export async function auditRepo(owner, repo, customToken) {
  const fullRepo = `${owner}/${repo}`;
  console.log(`\n🤖 Starting Autonomous Repo Audit for ${fullRepo}`);

  // Create a pending review document
  let reviewDoc = await Review.create({
    repo: fullRepo,
    prNumber: 0, // Placeholder until PR is opened
    headSha: 'pending',
    status: 'pending',
  });

  try {
    if (!customToken) {
      throw new Error('A GitHub Personal Access Token (PAT) is required for Autonomous Agent operations.');
    }

    const octokit = getOctokit(customToken);
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // 1. Get repository details to find default branch
    console.log(`  Fetching repository info for ${fullRepo}...`);
    const { data: repoInfo } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoInfo.default_branch;
    console.log(`  Default branch is: ${defaultBranch}`);

    // 2. Get latest commit SHA on default branch
    const { data: refInfo } = await octokit.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
    const baseSha = refInfo.object.sha;
    reviewDoc.headSha = baseSha;
    await reviewDoc.save();

    // 3. Fetch file tree recursively
    console.log(`  Fetching file tree recursively...`);
    const { data: treeInfo } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: baseSha,
      recursive: 'true'
    });

    // 4. Filter for relevant small source files (under 15KB to avoid token output limits)
    const reviewableExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.cpp', '.cs'];
    const skipDirs = ['node_modules', 'dist', 'build', '.git', 'coverage'];

    const eligibleFiles = treeInfo.tree.filter(node => {
      if (node.type !== 'blob') return false;
      const pathLower = node.path.toLowerCase();
      if (skipDirs.some(dir => pathLower.includes(`/${dir}/`) || pathLower.startsWith(`${dir}/`))) return false;
      const isReviewable = reviewableExtensions.some(ext => pathLower.endsWith(ext));
      const sizeOk = node.size && node.size <= 15000; // <= 15KB
      return isReviewable && sizeOk;
    });

    console.log(`  Found ${eligibleFiles.length} eligible source files. Selecting up to 5 key files...`);
    // Pick up to 5 key files (e.g. prioritizing src/, controllers/, components/ or just first 5)
    const selectedFiles = eligibleFiles
      .sort((a, b) => {
        // Prioritize src/ or lib/ paths
        const aSrc = a.path.includes('src/') || a.path.includes('lib/') ? 0 : 1;
        const bSrc = b.path.includes('src/') || b.path.includes('lib/') ? 0 : 1;
        if (aSrc !== bSrc) return aSrc - bSrc;
        return a.size - b.size; // smaller files first
      })
      .slice(0, 5);

    if (selectedFiles.length === 0) {
      console.log('No eligible source files found to audit.');
      reviewDoc.status = 'completed';
      reviewDoc.prTitle = 'Autonomous Codebase Audit';
      reviewDoc.summary = 'No eligible source files (JavaScript/TypeScript/Python/etc. under 15KB) were found in the codebase to audit.';
      reviewDoc.verdict = 'APPROVE';
      reviewDoc.riskLevel = 'low';
      await reviewDoc.save();
      return reviewDoc;
    }

    console.log(`  Selected files for audit: ${selectedFiles.map(f => f.path).join(', ')}`);

    const allComments = [];
    const modifiedFiles = []; // { path, originalContent, fixedContent, sha }

    // 5. Audit files one-by-one using Groq
    for (const file of selectedFiles) {
      console.log(`  Auditing file: ${file.path}...`);
      try {
        const { data: fileContent } = await octokit.repos.getContent({
          owner,
          repo,
          path: file.path,
          ref: baseSha
        });

        const content = Buffer.from(fileContent.content, 'base64').toString('utf8');

        // Call Groq to audit
        const response = await groq.chat.completions.create({
          model: MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: AUDIT_SYSTEM_PROMPT },
            { role: 'user', content: `File path: ${file.path}\nFile content:\n\`\`\`\n${content}\n\`\`\`` }
          ],
          temperature: 0.1,
          max_tokens: 3000,
        });

        const raw = response.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(raw);

        if (parsed.issuesFound && parsed.comments?.length > 0 && parsed.fixedContent) {
          console.log(`  ⚠️ Issues found in ${file.path}! Preparing patches...`);
          // Map comments path
          const comments = parsed.comments.map(c => ({
            path: file.path,
            line: c.line || 1,
            severity: c.severity || 'suggestion',
            comment: c.comment,
            suggestedFix: c.suggestedFix || null
          }));

          allComments.push(...comments);
          modifiedFiles.push({
            path: file.path,
            originalContent: content,
            fixedContent: parsed.fixedContent,
            sha: fileContent.sha
          });
        } else {
          console.log(`  ✅ No issues found in ${file.path}.`);
        }
      } catch (fileErr) {
        console.error(`  Error auditing file ${file.path}:`, fileErr.message);
      }
    }

    // 6. If no issues were found in any files
    if (modifiedFiles.length === 0) {
      console.log('✅ Audit completed! No code issues were found in the codebase.');
      reviewDoc.status = 'completed';
      reviewDoc.prTitle = 'Autonomous Codebase Audit';
      reviewDoc.summary = 'Codebase audit completed. No bugs, security vulnerabilities, or performance issues were detected in the audited files.';
      reviewDoc.verdict = 'APPROVE';
      reviewDoc.riskLevel = 'low';
      await reviewDoc.save();
      return reviewDoc;
    }

    // 7. Commit changes and open PR if there are modifications
    const branchName = `autofixai-patches-${Date.now()}`;
    console.log(`  Creating patch branch: ${branchName}...`);

    // Create the branch
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    });

    // Commit each modified file
    for (const mod of modifiedFiles) {
      console.log(`  Committing corrections to ${mod.path}...`);
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: mod.path,
        message: `fix(autofixai): automated AI code corrections for ${mod.path}`,
        content: Buffer.from(mod.fixedContent).toString('base64'),
        sha: mod.sha,
        branch: branchName
      });
    }

    // Create Pull Request
    console.log(`  Opening automated Pull Request on GitHub...`);
    const prTitle = '💎 AutoFixAI: Automated Codebase Audit & Bug Fixes';
    const prBody = `## 💎 AutoFixAI: Codebase Audit & Auto-Fixes

AutoFixAI's Autonomous AI Agent audited the repository's main branch and automatically identified security risks, bugs, or performance inefficiencies in the codebase.

### 🛠️ What was fixed:
${modifiedFiles.map(m => `- **${m.path}**: Corrected code vulnerabilities and quality issues.`).join('\n')}

Please review these changes and merge them to resolve the detected issues!`;

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: prTitle,
      head: branchName,
      base: defaultBranch,
      body: prBody
    });

    console.log(`🚀 Pull Request #${pr.number} successfully created!`);

    // 8. Finalize database review entry
    reviewDoc.prNumber = pr.number;
    reviewDoc.prTitle = prTitle;
    reviewDoc.comments = allComments;
    reviewDoc.verdict = 'REQUEST_CHANGES';
    reviewDoc.riskLevel = allComments.some(c => c.severity === 'security') ? 'high' : 'medium';
    reviewDoc.summary = `AutoFixAI scanned your main codebase and generated ${allComments.length} suggestions/fixes. Opened Pull Request #${pr.number} with automated commits.`;
    reviewDoc.status = 'completed';
    await reviewDoc.save();

    console.log(`✅ Autonomous Repo Audit & Fix complete!`);
    return reviewDoc;

  } catch (err) {
    console.error(`❌ Autonomous Audit failed:`, err.message);
    reviewDoc.status = 'failed';
    reviewDoc.summary = `Failed to execute codebase audit: ${err.message}`;
    await reviewDoc.save();
    throw err;
  }
}
