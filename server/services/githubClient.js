import { Octokit }      from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

/**
 * GitHub client — lazy singleton.
 *
 * Auth priority:
 *  1. GitHub App  — GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_INSTALLATION_ID
 *  2. PAT         — GITHUB_TOKEN
 *
 * The client is created on first use (not at module load) so the server
 * boots successfully even when GitHub credentials aren't set yet.
 * Reviews will fail at runtime if GitHub credentials are missing, but
 * the dashboard, auth, and stats routes all work without them.
 */
let _octokit = null;

function createOctokit() {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_INSTALLATION_ID, GITHUB_TOKEN } = process.env;

  if (GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY && GITHUB_INSTALLATION_ID) {
    console.log('  GitHub auth: App (installation token) ✓');
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId:          parseInt(GITHUB_APP_ID, 10),
        privateKey:     GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
        installationId: parseInt(GITHUB_INSTALLATION_ID, 10),
      },
    });
  }

  if (GITHUB_TOKEN) {
    console.log('  GitHub auth: Personal Access Token (dev mode) ✓');
    return new Octokit({ auth: GITHUB_TOKEN });
  }

  throw new Error(
    'GitHub auth not configured. Set either:\n' +
    '  • GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_INSTALLATION_ID  (production)\n' +
    '  • GITHUB_TOKEN  (development)\n' +
    'in your .env file.'
  );
}

/**
 * Returns the authenticated Octokit singleton.
 * Throws clearly if GitHub credentials are missing.
 */
export function getOctokit(customToken = null) {
  if (customToken) {
    return new Octokit({ auth: customToken });
  }
  if (!_octokit) _octokit = createOctokit();
  return _octokit;
}
