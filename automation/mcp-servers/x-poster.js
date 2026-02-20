#!/usr/bin/env node
/**
 * x-poster.js — WolfeUpHQ Twitter/X automation
 *
 * Two modes:
 *   node x-poster.js post       — original post (ultra professional, no personality)
 *   node x-poster.js reply      — find trending/viral posts and reply (unhinged troll energy)
 *
 * Personality split:
 *   POSTS: LinkedIn-brain, boardroom speak, thought leadership. Almost parody-level corporate.
 *   REPLIES: Chaotic, dry wit, savage but never hateful. Like a wolf in a suit who just doesn't care.
 */

const { chromium } = require('playwright');
const http = require('http');

// 4090 Ollama (free local inference) — direct LAN access from Mac VM
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434');
const OLLAMA_MODEL = 'qwen2.5:32b';

const CDP_URL = process.env.CDP_URL || 'http://localhost:9222';

const MODE = process.argv[2] || 'post';

// ── POST PROMPTS (professional to a fault) ──────────────────────────────────
const POST_SYSTEM = `You are the social media voice of WolfeUp, a sharp AI/tech company based in Kansas City.
Your posts are:
- Ultra professional, almost satirically so — think Fortune 500 press release meets startup manifesto
- About AI, tech, building, productivity, the future
- No fluff words like "excited" or "thrilled" — use confident declarative statements
- Short punchy sentences. No hashtags unless 1 max and very relevant.
- Never use emojis except occasionally a single 🐺 at the end
- Sound like a company that has its shit together and knows it

Write ONE post (under 280 chars). Just the post text, nothing else.`;

const POST_TOPICS = [
  "AI agents replacing entire workflows, not just tasks",
  "Why most startups fail at automation before they even start",
  "The gap between companies that use AI and companies that ARE AI",
  "Building in public vs building in private — which actually wins",
  "Why your tech stack is a liability after year 3",
  "The real cost of manual processes in 2026",
  "Hiring AI-native talent vs training existing teams",
  "What 'moving fast' actually means when you have real infrastructure",
  "Why Kansas City is quietly becoming a serious tech hub",
  "The companies winning right now all have one thing in common: they ship",
];

// ── REPLY PROMPTS (troll energy, dry wit, chaos) ────────────────────────────
const REPLY_SYSTEM = `You are replying on X (Twitter) as @WolfeUpHQ — a wolf in a suit who has completely run out of patience.
Your replies are:
- Dry, savage, deadpan humor — the kind that makes people laugh then feel personally attacked
- Short. Under 120 chars usually. Sometimes just 5 words.
- Never hateful, racist, or targeting individuals maliciously — just brutally honest or absurd
- You reply to tech bros, startup guys, crypto people, hustle culture posts, bad takes
- Occasionally pretend to be extremely formal about something ridiculous
- Sometimes ask an extremely pointed question with no context
- Never use hashtags. Rarely use emojis (maybe 🐺 or 💀 when earned)
- The energy: you saw this tweet, sighed, and decided the world needed to know

Write ONE reply (under 200 chars). Just the reply text, nothing else. No quotes, no explanation.`;

async function callModel(system, userMsg) {
  const body = JSON.stringify({
    model: OLLAMA_MODEL,
    prompt: `${system}\n\nUser: ${userMsg}\n\nAssistant:`,
    stream: false,
    options: { temperature: 0.8, num_predict: 300 }
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: OLLAMA_HOST, port: OLLAMA_PORT,
      path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const text = JSON.parse(data).response?.trim() || '';
          console.log(`[x-poster] 4090 generated (${text.length} chars)`);
          resolve(text);
        } catch(e) { reject(new Error('Ollama parse error: ' + e.message)); }
      });
    });
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Ollama timeout (60s)')); });
    req.on('error', e => reject(new Error('Ollama connection error: ' + e.message)));
    req.write(body);
    req.end();
  });
}

async function connectBrowser() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext();
  const pages = context.pages();
  // Find existing X tab or create one
  let page = pages.find(p => p.url().includes('x.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://x.com/home');
    await page.waitForTimeout(3000);
  }
  return { browser, page };
}

async function makePost() {
  console.log('[x-poster] Generating professional post...');
  const topic = POST_TOPICS[Math.floor(Math.random() * POST_TOPICS.length)];
  const text = await callModel(POST_SYSTEM, `Write a post about: ${topic}`);
  console.log(`[x-poster] Post text: ${text}`);

  const { browser, page } = await connectBrowser();
  try {
    await page.goto('https://x.com/compose/post');
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await page.click('[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(text, { delay: 30 });
    await page.waitForTimeout(1000);
    await page.click('[data-testid="tweetButton"]');
    await page.waitForTimeout(3000);
    console.log('[x-poster] Post sent!');
  } finally {
    await browser.close();
  }
}

async function makeReply() {
  console.log('[x-poster] Finding targets to reply to...');
  const { browser, page } = await connectBrowser();
  try {
    // Go to explore/trending to find posts to reply to
    await page.goto('https://x.com/explore/tabs/trending');
    await page.waitForTimeout(3000);

    // Find reply buttons on posts
    const replyButtons = await page.$$('[data-testid="reply"]');
    if (replyButtons.length === 0) {
      console.log('[x-poster] No reply targets found on trending');
      return;
    }

    // Pick a random post from first 5
    const idx = Math.floor(Math.random() * Math.min(5, replyButtons.length));

    // Get the tweet text for context
    const articles = await page.$$('article[data-testid="tweet"]');
    let tweetText = 'a trending tech/startup post';
    if (articles[idx]) {
      try {
        tweetText = await articles[idx].innerText();
        tweetText = tweetText.slice(0, 300); // truncate
      } catch {}
    }

    console.log(`[x-poster] Replying to: ${tweetText.slice(0, 100)}...`);
    const replyText = await callModel(REPLY_SYSTEM, `Write a reply to this tweet: "${tweetText}"`);
    console.log(`[x-poster] Reply text: ${replyText}`);

    // Click reply
    await replyButtons[idx].click();
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 8000 });
    await page.click('[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(replyText, { delay: 30 });
    await page.waitForTimeout(1000);
    await page.click('[data-testid="tweetButton"]');
    await page.waitForTimeout(3000);
    console.log('[x-poster] Reply sent!');
  } finally {
    await browser.close();
  }
}

(async () => {
  try {
    if (MODE === 'reply') {
      await makeReply();
    } else {
      await makePost();
    }
    process.exit(0);
  } catch (err) {
    console.error('[x-poster] Error:', err.message);
    process.exit(1);
  }
})();
