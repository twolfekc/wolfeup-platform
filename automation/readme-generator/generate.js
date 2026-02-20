'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isDryRun = process.argv.includes('--dry-run');

// ── Config ────────────────────────────────────────────────────────────────────
const REPO_ROOT     = path.resolve(__dirname, '..', '..');
const OLLAMA_URL    = process.env.OLLAMA_PRIMARY_URL || 'http://192.168.1.70:11434';
const OLLAMA_MODEL  = process.env.README_MODEL       || 'gemma3:27b';
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN       || '';
const LOG_DIR       = path.join(__dirname, 'logs');
const GIT_USER_NAME  = process.env.GIT_USER_NAME  || 'readme-bot';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'bot@wolfeup.com';

fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

// ── Collectors ────────────────────────────────────────────────────────────────
async function gatherStats() {
  log('Gathering stats from all collectors...');

  const [serverHealth, modelStatus, jobHistory, gameCount, githubStats] = await Promise.allSettled([
    require('./collectors/server-health').collect(),
    require('./collectors/model-status').collect(),
    require('./collectors/job-history').collect(),
    require('./collectors/game-count').collect(),
    require('./collectors/github-stats').collect(),
  ]);

  return {
    servers: serverHealth.status === 'fulfilled' ? serverHealth.value : { onlineCount: '?', totalCount: 5, servers: [] },
    models:  modelStatus.status  === 'fulfilled' ? modelStatus.value  : { loaded: 0, available: 0, vramUsedGb: 0, vramTotalGb: 24, online: false },
    jobs:    jobHistory.status   === 'fulfilled' ? jobHistory.value   : { totalJobs: 0, completedJobs: 0, online: false },
    games:   gameCount.status    === 'fulfilled' ? gameCount.value    : { count: 75 },
    github:  githubStats.status  === 'fulfilled' ? githubStats.value  : { stars: 0, forks: 0 },
  };
}

// ── LLM Generation ───────────────────────────────────────────────────────────
async function generateSection(prompt, maxTokens = 300) {
  log(`Calling ${OLLAMA_MODEL} for section generation...`);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.85, top_p: 0.9, num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = await res.json();
    return (data.response || '').trim();
  } catch (err) {
    log(`LLM error: ${err.message}`);
    return null;
  }
}

// ── README Assembly ───────────────────────────────────────────────────────────
async function buildReadme(stats) {
  const header = fs.readFileSync(path.join(__dirname, 'templates', 'header.md'), 'utf8');
  const footer = fs.readFileSync(path.join(__dirname, 'templates', 'footer.md'), 'utf8');

  // Stats table (always fresh)
  const updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const statsTable = `
## Platform Status

| Metric | Value |
|--------|-------|
| Servers Online | ${stats.servers.onlineCount}/${stats.servers.totalCount} |
| Games Running | ${stats.games.count}+ |
| Models Available | ${stats.models.available} |
| Models Loaded | ${stats.models.loaded} (${stats.models.vramUsedGb}GB / ${stats.models.vramTotalGb}GB VRAM) |
| Reply Jobs (recent) | ${stats.jobs.completedJobs} completed |
| GitHub Stars | ${stats.github.stars} |
| Last Updated | ${updatedAt} |

`;

  // AI-generated pitch
  const pitchPrompt = `You are writing a one-paragraph description for the GitHub README of WolfeUp Platform, an autonomous AI infrastructure project.

Current stats:
- ${stats.servers.onlineCount} of ${stats.servers.totalCount} servers online
- ${stats.games.count}+ games running
- ${stats.models.loaded} AI models loaded (${stats.models.vramUsedGb}GB VRAM used)
- ${stats.jobs.completedJobs} reply bot jobs completed recently
- ${stats.github.stars} GitHub stars

Write a compelling, specific 2-3 sentence description of what this platform is and why it's impressive. Be direct, technical, and vivid. Vary the angle from "autonomous AI infrastructure" — maybe focus on the scale, the hardware, the zero-sleep operation, or the browser automation. Do not use bullet points. Output only the paragraph, no headers or meta-commentary.`;

  const pitch = await generateSection(pitchPrompt, 200);

  // AI-generated "what's happening now"
  const nowPrompt = `Write 2 sentences describing what's happening right now in the WolfeUp Platform based on these live stats:
- Models in VRAM: ${stats.models.loadedNames.length > 0 ? stats.models.loadedNames.join(', ') : 'none loaded'}
- Reply bot jobs completed recently: ${stats.jobs.completedJobs}
- Last job status: ${stats.jobs.lastJobStatus || 'unknown'}
- GPU VRAM used: ${stats.models.vramUsedGb}GB of ${stats.models.vramTotalGb}GB

Write in present tense, conversational, like a status update. Be specific about the models and numbers. Output only the 2 sentences, no headers.`;

  const nowSection = await generateSection(nowPrompt, 150);

  // Build final README
  let readme = header;

  if (pitch) {
    readme += `\n## What This Is\n\n${pitch}\n\n`;
  } else {
    readme += `\n## What This Is\n\nA fully self-hosted, autonomous AI infrastructure running 24/7 across 5 machines with zero cloud dependency for compute.\n\n`;
  }

  if (nowSection) {
    readme += `## What's Happening Now\n\n${nowSection}\n\n`;
  }

  readme += statsTable;
  readme += footer;

  return readme;
}

// ── Git Push ──────────────────────────────────────────────────────────────────
function pushToGithub(readmeContent) {
  log('Writing README.md to repo...');
  const readmePath = path.join(REPO_ROOT, 'README.md');
  fs.writeFileSync(readmePath, readmeContent, 'utf8');

  log('Committing and pushing...');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME:     GIT_USER_NAME,
    GIT_AUTHOR_EMAIL:    GIT_USER_EMAIL,
    GIT_COMMITTER_NAME:  GIT_USER_NAME,
    GIT_COMMITTER_EMAIL: GIT_USER_EMAIL,
  };

  // Configure token-based push if GITHUB_TOKEN is set
  if (GITHUB_TOKEN) {
    try {
      execSync(
        `git -C "${REPO_ROOT}" remote set-url origin https://${GITHUB_TOKEN}@github.com/twolfekc/wolfeup-platform.git`,
        { env, stdio: 'pipe' }
      );
    } catch {}
  }

  execSync(`git -C "${REPO_ROOT}" add README.md`, { env, stdio: 'pipe' });

  // Check if there are actual changes
  try {
    execSync(`git -C "${REPO_ROOT}" diff --cached --exit-code`, { env, stdio: 'pipe' });
    log('No changes to README, skipping push.');
    return false;
  } catch {
    // Changes exist, proceed
  }

  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  execSync(
    `git -C "${REPO_ROOT}" commit -m "chore: regenerate README [${now}] [skip ci]"`,
    { env, stdio: 'pipe' }
  );
  execSync(`git -C "${REPO_ROOT}" push origin main`, { env, stdio: 'pipe' });
  log('README pushed to GitHub successfully.');
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`Starting README generation (model: ${OLLAMA_MODEL}, dry-run: ${isDryRun})`);

  let stats;
  try {
    stats = await gatherStats();
    log(`Stats: ${stats.servers.onlineCount}/${stats.servers.totalCount} servers, ${stats.models.loaded} models loaded, ${stats.jobs.completedJobs} jobs`);
  } catch (err) {
    log(`Failed to gather stats: ${err.message}`);
    process.exit(1);
  }

  let readme;
  try {
    readme = await buildReadme(stats);
    log(`README built (${readme.length} chars)`);
  } catch (err) {
    log(`Failed to build README: ${err.message}`);
    process.exit(1);
  }

  if (isDryRun) {
    log('DRY RUN — writing to /tmp/readme-preview.md instead of pushing');
    fs.writeFileSync('/tmp/readme-preview.md', readme, 'utf8');
    log('Preview written to /tmp/readme-preview.md');
    return;
  }

  try {
    pushToGithub(readme);
  } catch (err) {
    log(`Failed to push: ${err.message}`);
    process.exit(1);
  }

  log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
