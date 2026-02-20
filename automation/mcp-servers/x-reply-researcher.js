#!/usr/bin/env node
/**
 * x-reply-researcher.js — WolfeUpHQ Twitter/X reply bot
 *
 * Spends ~5 minutes browsing X (tech, sports, politics), collecting tweets.
 * Uses the RTX 4090 (Ollama qwen2.5:32b) to:
 *   1. Score every collected tweet for reply-worthiness
 *   2. Pick the best candidate
 *   3. Generate a savage reply
 *   4. Post it via Playwright/CDP
 *
 * Runs on Mac VM, controls Chrome via CDP.
 * All LLM calls go to local Ollama (free, no paid API).
 *
 * Usage: node x-reply-researcher.js
 *
 * Requires: Chrome running with --remote-debugging-port (set CDP_PORT env)
 *           --user-data-dir=/Users/openclaw/chrome-cdp (logged into X)
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:32b';
const CDP_URL = process.env.CDP_URL || 'http://localhost:9222';

const LOG_FILE = '/Users/openclaw/mcp/x-reply-researcher.log';

// Categories to browse — tech, sports, politics
const SEARCH_QUERIES = [
  { query: 'AI', category: 'tech' },
  { query: 'startup', category: 'tech' },
  { query: 'coding', category: 'tech' },
  { query: 'NFL', category: 'sports' },
  { query: 'NBA', category: 'sports' },
  { query: 'politics', category: 'politics' },
  { query: 'Congress', category: 'politics' },
];

// ── Logging ─────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ── Ollama call ─────────────────────────────────────────────────────────────
function callOllama(prompt, opts = {}) {
  const body = JSON.stringify({
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    options: { temperature: opts.temperature || 0.7, num_predict: opts.maxTokens || 500 }
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
          resolve(text);
        } catch (e) { reject(new Error('Ollama parse: ' + e.message)); }
      });
    });
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Ollama timeout (90s)')); });
    req.on('error', e => reject(new Error('Ollama error: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// ── Extract tweets from a page ──────────────────────────────────────────────
async function extractTweets(page) {
  const tweets = [];
  const articles = await page.$$('article[data-testid="tweet"]');

  for (let i = 0; i < Math.min(articles.length, 8); i++) {
    try {
      const article = articles[i];

      // Get tweet text
      const textEls = await article.$$('[data-testid="tweetText"]');
      let text = '';
      for (const el of textEls) {
        text += (await el.innerText()).trim() + ' ';
      }
      text = text.trim();
      if (!text || text.length < 20) continue;

      // Get author handle and tweet URL
      let author = 'unknown';
      let tweetUrl = '';
      try {
        const links = await article.$$('a[role="link"]');
        for (const link of links) {
          const href = await link.getAttribute('href');
          if (href && href.includes('/status/')) {
            tweetUrl = href;  // e.g. /username/status/123456789
          }
          if (href && href.startsWith('/') && !href.includes('/status/') && !href.includes('/hashtag/') && href.length > 1 && !author.startsWith('@')) {
            author = href.replace('/', '@');
          }
        }
      } catch {}

      // Get engagement (likes, retweets) — look for aria-label on group buttons
      let likes = 0, retweets = 0, replies = 0;
      try {
        const groups = await article.$$('[role="group"] button');
        for (const btn of groups) {
          const label = await btn.getAttribute('aria-label') || '';
          const replyMatch = label.match(/(\d[\d,]*)\s*repl/i);
          const rtMatch = label.match(/(\d[\d,]*)\s*re(?:post|tweet)/i);
          const likeMatch = label.match(/(\d[\d,]*)\s*like/i);
          if (replyMatch) replies = parseInt(replyMatch[1].replace(/,/g, ''));
          if (rtMatch) retweets = parseInt(rtMatch[1].replace(/,/g, ''));
          if (likeMatch) likes = parseInt(likeMatch[1].replace(/,/g, ''));
        }
      } catch {}

      // Find the reply button for this tweet
      let replyButton = null;
      try {
        replyButton = await article.$('[data-testid="reply"]');
      } catch {}

      tweets.push({
        text: text.slice(0, 500),
        author,
        tweetUrl,
        likes,
        retweets,
        replies,
        engagement: likes + retweets * 2 + replies,
        replyButton,
        articleIndex: i
      });
    } catch (e) {
      // Skip broken tweets
    }
  }

  return tweets;
}

// ── Browse a search page and collect tweets ─────────────────────────────────
async function browseSearch(page, query, category) {
  log(`Browsing: "${query}" (${category})`);
  try {
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Scroll down to load more tweets
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);

    const tweets = await extractTweets(page);
    log(`  Found ${tweets.length} tweets for "${query}"`);

    // Tag category and return (without replyButton refs since page will change)
    return tweets.map(t => ({
      ...t,
      category,
      searchQuery: query,
      replyButton: null  // can't keep button refs across page navigations
    }));
  } catch (e) {
    log(`  Error browsing "${query}": ${e.message}`);
    return [];
  }
}

// ── Use 4090 to pick the best tweet to reply to ────────────────────────────
async function pickBestTweet(candidates) {
  const tweetList = candidates.map((t, i) =>
    `[${i}] @${t.author} (${t.category}) [${t.likes}♥ ${t.retweets}🔁 ${t.replies}💬]\n"${t.text.slice(0, 300)}"`
  ).join('\n\n');

  const prompt = `You are a social media strategist for @WolfeUpHQ, a sharp AI/tech company.

Below are tweets collected from X/Twitter across tech, sports, and politics categories.

Pick the ONE tweet that would be most fun to reply to — considering:
- High engagement (more eyeballs on our reply)
- Interesting or debatable take (gives us material)
- Tech, sports, or politics related (our lane)
- Avoid replying to big verified brands or news outlets (reply to people/creators)
- Prefer tweets where a witty reply would land well

TWEETS:
${tweetList}

Respond with ONLY the number [N] of your pick and a 1-sentence reason. Example:
[3] Hot take about AI that's begging for a reality check.`;

  const response = await callOllama(prompt, { temperature: 0.5, maxTokens: 100 });
  log(`4090 pick response: ${response}`);

  // Parse the number
  const match = response.match(/\[(\d+)\]/);
  if (match) {
    const idx = parseInt(match[1]);
    if (idx >= 0 && idx < candidates.length) return idx;
  }

  // Fallback: pick the one with highest engagement
  let bestIdx = 0;
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].engagement > candidates[bestIdx].engagement) bestIdx = i;
  }
  log(`Fallback: picking highest engagement tweet [${bestIdx}]`);
  return bestIdx;
}

// ── Generate reply with 4090 ────────────────────────────────────────────────
async function generateReply(tweet) {
  const categoryHint = {
    tech: 'This is a tech tweet. Channel your inner dry-wit tech critic.',
    sports: 'This is a sports tweet. Be the person who brings uncomfortable logic to sports takes.',
    politics: 'This is a politics tweet. Be diplomatically savage — never partisan, just devastatingly observant.'
  };

  const prompt = `You are replying on X (Twitter) as @WolfeUpHQ — a wolf in a suit who has completely run out of patience.

Your replies are:
- Dry, savage, deadpan humor — makes people laugh then feel personally attacked
- Short. Under 150 chars usually. Sometimes just 5 words.
- Never hateful, racist, or targeting individuals maliciously — just brutally honest or absurd
- Occasionally pretend to be extremely formal about something ridiculous
- Sometimes ask an extremely pointed question with no context
- Never use hashtags. Rarely use emojis (maybe 🐺 or 💀 when earned)
- The energy: you saw this tweet, sighed, and decided the world needed to know

${categoryHint[tweet.category] || ''}

The tweet you're replying to (by @${tweet.author}):
"${tweet.text}"

Write ONE reply (under 150 chars). Just the reply text, nothing else. No quotes around it. No explanation.`;

  const reply = await callOllama(prompt, { temperature: 0.85, maxTokens: 100 });

  // Clean up — remove wrapping quotes if model added them
  let cleaned = reply.replace(/^["']|["']$/g, '').trim();
  // Ensure under 280 chars (X limit)
  if (cleaned.length > 280) cleaned = cleaned.slice(0, 277) + '...';

  return cleaned;
}

// ── Post the reply via Playwright ───────────────────────────────────────────
async function postReply(page, tweet, replyText) {
  // Strategy 1: Navigate directly to the tweet if we have a URL
  if (tweet.tweetUrl) {
    // Clean the URL — extract just /user/status/id
    let cleanPath = tweet.tweetUrl;
    const statusMatch = cleanPath.match(/(\/[^/]+\/status\/\d+)/);
    if (statusMatch) cleanPath = statusMatch[1];
    const fullUrl = `https://x.com${cleanPath}`;
    log(`Navigating directly to tweet: ${fullUrl}`);
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);

    // Dismiss any overlay/modal that might be blocking
    try {
      const mask = await page.$('[data-testid="mask"]');
      if (mask) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } catch {}

    // On a tweet detail page, the reply box is often already visible at the bottom
    let replyBox = await page.$('[data-testid="tweetTextarea_0"]');
    if (!replyBox) {
      // Click the reply button on the main tweet
      const replyBtn = await page.$('[data-testid="reply"]');
      if (replyBtn) {
        // Dismiss any overlay first
        try {
          const mask2 = await page.$('[data-testid="mask"]');
          if (mask2) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
        } catch {}
        await replyBtn.click();
        await page.waitForTimeout(2000);
        replyBox = await page.$('[data-testid="tweetTextarea_0"]');
      }
    }

    if (replyBox) {
      await replyBox.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(replyText, { delay: 35 });
      await page.waitForTimeout(1000);

      // Find the Reply/Post button — could be tweetButton or tweetButtonInline
      let postBtn = await page.$('[data-testid="tweetButton"]');
      if (!postBtn) postBtn = await page.$('[data-testid="tweetButtonInline"]');
      if (postBtn) {
        await postBtn.click();
        await page.waitForTimeout(3000);
        log('Reply posted via direct tweet URL!');
        return;
      }
    }
    log('Direct URL approach failed, trying search fallback...');
  }

  // Strategy 2: Search for the tweet by the original query
  log(`Searching for tweet by @${tweet.author} via "${tweet.searchQuery}"...`);
  const searchUrl = `https://x.com/search?q=${encodeURIComponent(tweet.searchQuery)}&src=typed_query&f=top`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(4000);

  // Scroll to load tweets
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(2000);

  // Find the tweet by matching text
  const articles = await page.$$('article[data-testid="tweet"]');
  let targetReplyBtn = null;

  for (const article of articles) {
    try {
      const textEls = await article.$$('[data-testid="tweetText"]');
      let articleText = '';
      for (const el of textEls) {
        articleText += (await el.innerText()).trim() + ' ';
      }
      // Fuzzy match on first 40 chars
      if (articleText.trim().slice(0, 40) === tweet.text.slice(0, 40)) {
        targetReplyBtn = await article.$('[data-testid="reply"]');
        log('Found matching tweet in search results');
        break;
      }
    } catch {}
  }

  if (!targetReplyBtn) {
    // Fallback: just use the first high-engagement tweet we find
    log('Could not find exact tweet, using first available reply button');
    if (articles.length > 0) {
      targetReplyBtn = await articles[0].$('[data-testid="reply"]');
    }
    if (!targetReplyBtn) throw new Error('No reply button found on page');
  }

  // Click reply
  await targetReplyBtn.click();
  await page.waitForTimeout(2000);

  // Wait for the reply textarea
  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 8000 });
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.waitForTimeout(500);

  // Type the reply with human-like delay
  await page.keyboard.type(replyText, { delay: 35 });
  await page.waitForTimeout(1000);

  // Click the reply/post button
  const postBtn = await page.$('[data-testid="tweetButton"]');
  if (!postBtn) throw new Error('Could not find tweet/reply button');
  await postBtn.click();
  await page.waitForTimeout(3000);

  log('Reply posted via search fallback!');
}

// ── Ensure Chrome is running with CDP ───────────────────────────────────────
async function ensureChrome() {
  const { execSync } = require('child_process');
  try {
    // Quick check if CDP is responding
    const cdpPort = (CDP_URL.match(/:(\d+)/) || [])[1] || '9222';
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${cdpPort}/json/version`, { timeout: 5000 });
    if (result.toString().trim() === '200') return;
  } catch {}

  // Chrome not running with CDP — try to launch it
  log('Chrome CDP not responding, attempting to launch...');
  try {
    execSync('pgrep -f "Google Chrome" && kill -9 $(pgrep -f "Google Chrome") || true', { timeout: 5000 });
    execSync('sleep 2', { timeout: 5000 });
    execSync(
      'nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ' +
      `--remote-debugging-port=${cdpPort} --no-first-run --no-default-browser-check ` +
      '--user-data-dir=$HOME/chrome-cdp "https://x.com/home" > /dev/null 2>&1 &',
      { timeout: 5000 }
    );
    execSync('sleep 6', { timeout: 10000 });
    log('Chrome launched with CDP');
  } catch (e) {
    log('Failed to launch Chrome: ' + e.message);
    throw new Error('Chrome CDP unavailable');
  }
}

// ── Main flow ───────────────────────────────────────────────────────────────
async function main() {
  log('=== X Reply Researcher starting ===');
  const startTime = Date.now();

  // Verify 4090 is reachable
  try {
    const testResp = await callOllama('Say "ok" and nothing else.', { temperature: 0, maxTokens: 10 });
    log(`4090 health check: "${testResp}" — OK`);
  } catch (e) {
    log(`4090 not reachable: ${e.message} — ABORTING`);
    process.exit(1);
  }

  // Ensure Chrome CDP is running
  await ensureChrome();

  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0] || await browser.newContext();
  const pages = ctx.pages();
  let page = pages.find(p => p.url().includes('x.com'));
  if (!page) {
    page = await ctx.newPage();
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  }

  // Check login
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('flow')) {
    log('ERROR: Not logged into X — aborting');
    await browser.close();
    process.exit(1);
  }

  // ── Phase 1: Research (browse for ~5 minutes) ─────────────────────────────
  log('Phase 1: Browsing X for candidates...');
  const allCandidates = [];

  // Shuffle search queries so we don't always hit the same ones first
  const shuffled = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);

  // Also check trending
  log('Checking trending...');
  try {
    await page.goto('https://x.com/explore/tabs/trending', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(2000);
    const trendingTweets = await extractTweets(page);
    trendingTweets.forEach(t => {
      t.category = 'trending';
      t.searchQuery = 'trending';
      t.replyButton = null;
    });
    allCandidates.push(...trendingTweets);
    log(`  Found ${trendingTweets.length} trending tweets`);
  } catch (e) {
    log(`  Trending error: ${e.message}`);
  }

  // Browse each search query with ~30s between
  for (const { query, category } of shuffled) {
    // Check time — stop collecting after 4 minutes (leave 1 min for picking + replying)
    if (Date.now() - startTime > 4 * 60 * 1000) {
      log('4 minutes elapsed, moving to selection phase');
      break;
    }

    const tweets = await browseSearch(page, query, category);
    allCandidates.push(...tweets);

    // Brief pause between searches to look natural
    await page.waitForTimeout(2000 + Math.random() * 3000);
  }

  // Also browse home timeline for organic content
  if (Date.now() - startTime < 4 * 60 * 1000) {
    log('Checking home timeline...');
    try {
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(2000);
      const homeTweets = await extractTweets(page);
      homeTweets.forEach(t => {
        t.category = 'home';
        t.searchQuery = 'home';
        t.replyButton = null;
      });
      allCandidates.push(...homeTweets);
      log(`  Found ${homeTweets.length} home timeline tweets`);
    } catch (e) {
      log(`  Home timeline error: ${e.message}`);
    }
  }

  log(`\nTotal candidates collected: ${allCandidates.length}`);

  if (allCandidates.length === 0) {
    log('No candidates found — aborting');
    await browser.close();
    process.exit(1);
  }

  // Deduplicate by text (first 50 chars)
  const seen = new Set();
  const unique = allCandidates.filter(t => {
    const key = t.text.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  log(`Unique candidates after dedup: ${unique.length}`);

  // Filter: only keep tweets with some engagement or from interesting categories
  const filtered = unique.filter(t =>
    t.engagement >= 5 || t.category === 'trending' || t.text.length > 50
  );
  log(`Filtered candidates (min engagement or trending): ${filtered.length}`);

  // Take top 15 by engagement for the 4090 to choose from
  const top = filtered
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 15);

  // ── Phase 2: Pick the best tweet using 4090 ──────────────────────────────
  log('\nPhase 2: Asking 4090 to pick the best tweet...');
  const pickIdx = await pickBestTweet(top);
  const chosen = top[pickIdx];

  log(`\nChosen tweet [${pickIdx}]: @${chosen.author} (${chosen.category})`);
  log(`  "${chosen.text.slice(0, 200)}"`);
  log(`  Engagement: ${chosen.likes}♥ ${chosen.retweets}🔁 ${chosen.replies}💬`);

  // ── Phase 3: Generate reply using 4090 ────────────────────────────────────
  log('\nPhase 3: Generating reply with 4090...');
  const replyText = await generateReply(chosen);
  log(`Reply: "${replyText}" (${replyText.length} chars)`);

  // ── Phase 4: Post the reply ───────────────────────────────────────────────
  log('\nPhase 4: Posting reply...');
  try {
    await postReply(page, chosen, replyText);
    log('\n=== SUCCESS ===');
    log(`Replied to @${chosen.author} (${chosen.category}): "${replyText}"`);
    log(`Total time: ${Math.round((Date.now() - startTime) / 1000)}s`);
  } catch (e) {
    log(`Failed to post reply: ${e.message}`);
    log('The reply was generated but could not be posted.');
  }

  await browser.close();
  process.exit(0);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
