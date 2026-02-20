const { connectBrowser, disconnectBrowser, searchTwitter, postReply } = require("./lib/browser");

(async () => {
  const { browser, page, source } = await connectBrowser();
  console.log("Connected via:", source, "URL:", page.url());

  // Search for tweets
  console.log("Searching...");
  const tweets = await searchTwitter(page, "AI agents", 3);
  console.log("Found", tweets.length, "tweets");

  if (tweets.length === 0) {
    console.log("No tweets found");
    await disconnectBrowser(browser, source);
    return;
  }

  // Pick the first tweet with decent engagement
  let target = null;
  for (const t of tweets) {
    if (t.likes >= 5 && t.text.length > 30) {
      target = t;
      break;
    }
  }

  if (!target) {
    target = tweets[0];
  }

  console.log("Target tweet:", JSON.stringify({
    author: target.author,
    likes: target.likes,
    text: target.text.slice(0, 100),
    url: target.tweetUrl
  }));

  // Try navigating to it first to see if page loads
  console.log("Navigating to tweet...");
  await page.goto(target.tweetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("Page body:", bodyText.slice(0, 300));

  // Check for reply elements
  const testids = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-testid]")).map(e => e.getAttribute("data-testid"));
  });
  const unique = [...new Set(testids)];
  console.log("TestIDs:", unique.filter(t => t.includes("tweet") || t.includes("reply") || t.includes("Reply") || t.includes("Text")).join(", "));

  // Check for tweet text specifically
  const tweetTextEls = await page.$$('[data-testid="tweetText"]');
  console.log("tweetText elements:", tweetTextEls.length);

  await disconnectBrowser(browser, source);
})().catch((e) => console.error("Error:", e.message));
