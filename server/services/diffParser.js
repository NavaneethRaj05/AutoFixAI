import { getOctokit } from './githubClient.js';

// Files to skip — generated, minified, or binary-like
const SKIP_PATTERNS = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.min.js',
  '.min.css',
  'dist/',
  'build/',
  '.map',
  '__snapshots__',
  '.pb.go',
  '.pb.js',
];

const MAX_PATCH_CHARS = 6000;

/**
 * Returns whether a filename should be skipped.
 */
function shouldSkip(filename) {
  return SKIP_PATTERNS.some((pattern) => filename.includes(pattern));
}

/**
 * Fetches the list of changed files for a PR.
 * Filters out noise and slices patches to stay within token limits.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<Array<{ filename, patch, sha }>>}
 */
export async function fetchPRFiles(owner, repo, prNumber, customToken = null) {
  try {
    const octokit = getOctokit(customToken);
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    return files
      .filter((f) => f.patch && !shouldSkip(f.filename))
      .map((f) => ({
        filename: f.filename,
        patch:    f.patch.slice(0, MAX_PATCH_CHARS),
        sha:      f.sha,
        status:   f.status, // added | modified | removed | renamed
      }));
  } catch (err) {
    console.error(`Failed to fetch PR files for ${owner}/${repo}#${prNumber}:`, err.message);
    throw err;
  }
}

/**
 * Fetches PR metadata (title, author, head SHA).
 */
export async function fetchPRMeta(owner, repo, prNumber, customToken = null) {
  try {
    const octokit = getOctokit(customToken);
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      title:   pr.title,
      author:  pr.user?.login ?? 'unknown',
      headSha: pr.head.sha,
    };
  } catch (err) {
    console.error(`Failed to fetch PR meta for ${owner}/${repo}#${prNumber}:`, err.message);
    throw err;
  }
}
