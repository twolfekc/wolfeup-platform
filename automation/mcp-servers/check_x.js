const { chromium } = require("playwright");
(async () => {
  try {
    const browser = await chromium.connectOverCDP(process.env.CDP_URL || "http://localhost:9222");
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    const pages = context.pages();
    console.log("Open pages:", pages.map(p => p.url()));

    let page = pages.find(p => p.url().includes("x.com"));
    if (!page) page = await context.newPage();

    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(5000);

    const url = page.url();
    const title = await page.title();
    console.log("URL:", url);
    console.log("Title:", title);

    if (url.includes("login") || url.includes("flow")) {
      console.log("STATUS: NOT LOGGED IN - redirected to login page");
    } else {
      console.log("STATUS: LOGGED IN");

      const tweets = await page.$$("article[data-testid=tweet]");
      console.log("Tweets visible on home:", tweets.length);

      await page.goto("https://x.com/explore/tabs/trending", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(5000);

      const trendingUrl = page.url();
      console.log("Trending URL:", trendingUrl);

      const trendTweets = await page.$$("article[data-testid=tweet]");
      console.log("Tweets on trending:", trendTweets.length);

      const replyBtns = await page.$$("[data-testid=reply]");
      console.log("Reply buttons on trending:", replyBtns.length);
    }

    await browser.close();
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
})();
