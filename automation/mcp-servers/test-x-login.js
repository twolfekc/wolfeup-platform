const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const pages = ctx.pages();
  let page = pages.find(p => p.url().includes('x.com')) || await ctx.newPage();
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  const url = page.url();
  console.log('URL:', url);
  if (url.includes('login') || url.includes('flow')) {
    console.log('STATUS: NOT_LOGGED_IN');
  } else {
    console.log('STATUS: LOGGED_IN');
    const tweets = await page.$$('article[data-testid="tweet"]');
    console.log('Tweets visible:', tweets.length);
  }
  await browser.close();
  process.exit(0);
})();
