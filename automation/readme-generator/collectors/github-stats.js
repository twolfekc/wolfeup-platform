'use strict';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = 'twolfekc/wolfeup-platform';

async function collect() {
  try {
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    return {
      stars:       data.stargazers_count || 0,
      forks:       data.forks_count || 0,
      watchers:    data.watchers_count || 0,
      openIssues:  data.open_issues_count || 0,
      pushedAt:    data.pushed_at,
      online: true,
    };
  } catch (err) {
    return { stars: 0, forks: 0, watchers: 0, openIssues: 0, online: false, error: err.message };
  }
}

module.exports = { collect };
