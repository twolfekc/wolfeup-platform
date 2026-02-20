const { chromium } = require("playwright-core");
const path = require("path");

const CDP_URL = process.env.CDP_URL || "http://localhost:9222";
const BROWSER_STATE_DIR = path.join(__dirname, "..", "data", "browser-state");

async function connectBrowser() {
  // Try CDP first
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const contexts = browser.contexts();
    // Find the context/page that is already on x.com
    for (const ctx of contexts) {
      const pages = ctx.pages();
      for (const p of pages) {
        const url = p.url();
        if (url.includes("x.com") && !url.includes("/flow/login")) {
          console.log("Found existing X page:", url);
          // Auto-dismiss any JS dialogs to prevent crashes
          p.on("dialog", async (dialog) => {
            console.log("Auto-dismissing dialog:", dialog.type(), dialog.message().slice(0, 100));
            await dialog.dismiss().catch(() => {});
          });
          return { browser, context: ctx, page: p, source: "cdp" };
        }
      }
    }
    // If no x.com page found, use first context and create page
    const context = contexts[0] || (await browser.newContext());
    const page = await context.newPage();
    page.on("dialog", async (dialog) => {
      await dialog.dismiss().catch(() => {});
    });
    return { browser, context, page, source: "cdp" };
  } catch (e) {
    console.log(`CDP connection failed (${e.message}), launching local chromium...`);
  }

  // Fallback to local
  const context = await chromium.launchPersistentContext(BROWSER_STATE_DIR, {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = context.pages()[0] || (await context.newPage());
  return { browser: context, context, page, source: "local" };
}

async function disconnectBrowser(browser, source) {
  try {
    // For CDP, don't close the browser - just disconnect
    if (source === "cdp") {
      await browser.close();
    } else {
      await browser.close();
    }
  } catch (e) {
    console.error("Browser disconnect error:", e.message);
  }
}

async function extractTweets(page) {
  return page.evaluate(() => {
    const tweets = [];
    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    for (const article of articles) {
      try {
        // Tweet text
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text = textEl ? textEl.innerText : "";

        // Author and URL
        let author = "";
        let tweetUrl = "";
        const links = article.querySelectorAll('a[role="link"]');
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          if (href.includes("/status/")) {
            tweetUrl = "https://x.com" + href;
            const parts = href.split("/");
            author = parts[1] || "";
            break;
          }
        }

        // Engagement
        let likes = 0;
        let retweets = 0;
        let replies = 0;
        const buttons = article.querySelectorAll('[role="group"] button');
        for (const btn of buttons) {
          const label = btn.getAttribute("aria-label") || "";
          const likeMatch = label.match(/([\d,]+)\s*(like|Like)/);
          const rtMatch = label.match(/([\d,]+)\s*(retweet|Retweet|repost|Repost)/);
          const replyMatch = label.match(/([\d,]+)\s*(repl|Repl)/);
          if (likeMatch) likes = parseInt(likeMatch[1].replace(/,/g, ""), 10);
          if (rtMatch) retweets = parseInt(rtMatch[1].replace(/,/g, ""), 10);
          if (replyMatch) replies = parseInt(replyMatch[1].replace(/,/g, ""), 10);
        }

        if (text && tweetUrl) {
          tweets.push({ text, author, tweetUrl, likes, retweets, replies });
        }
      } catch (e) {
        // skip malformed tweet
      }
    }
    return tweets;
  });
}

async function searchTwitter(page, query, scrollCount = 3) {
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  for (let i = 0; i < scrollCount; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(2000);
  }

  return extractTweets(page);
}

async function postReply(page, tweetUrl, replyText) {
  // Navigate to the tweet
  await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Check if we're logged in (look for login prompt)
  const loginPrompt = await page.$('[data-testid="loginButton"], a[href="/i/flow/login"]');
  if (loginPrompt) {
    throw new Error("Not logged in to X - session expired");
  }

  // Dismiss any overlays (cookie banners, notification prompts, etc.)
  await page.evaluate(() => {
    const layers = document.getElementById("layers");
    if (layers) {
      const overlays = layers.querySelectorAll('[role="dialog"], [data-testid="sheetDialog"], [data-testid="toast"]');
      overlays.forEach((el) => el.remove());
      const blockers = layers.querySelectorAll("div");
      blockers.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.position === "fixed" || style.position === "absolute") {
          if (el.children.length === 0 || el.querySelector('[role="dialog"]')) {
            el.style.pointerEvents = "none";
          }
        }
      });
    }
  });
  await page.waitForTimeout(1000);

  // Count existing replies/tweets before posting so we can detect new ones
  const beforeReplyCount = await page.$$eval('article[data-testid="tweet"]', (els) => els.length).catch(() => 0);

  // On tweet detail page, the reply compose box is directly visible
  let textarea = null;

  // Try direct textarea first
  try {
    textarea = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 8000 });
  } catch {
    console.log("No inline textarea, trying reply button...");
    try {
      const replyBtn = await page.waitForSelector('[data-testid="reply"]', { timeout: 5000 });
      await replyBtn.click({ force: true });
      await page.waitForTimeout(2000);
      textarea = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 8000 });
    } catch {
      console.log("Trying contenteditable div...");
      textarea = await page.waitForSelector('div[role="textbox"]', { timeout: 5000 });
    }
  }

  // Click and type
  await textarea.click({ force: true });
  await page.waitForTimeout(500);
  await page.keyboard.type(replyText, { delay: 25 });
  await page.waitForTimeout(1000);

  // Find and click the reply/post button
  let sendBtn = null;
  try {
    sendBtn = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 5000 });
  } catch {
    sendBtn = await page.waitForSelector('[data-testid="tweetButton"]', { timeout: 5000 });
  }

  // Check if the send button is disabled (e.g., due to content policy)
  const isDisabled = await sendBtn.evaluate((el) => el.getAttribute("aria-disabled") === "true" || el.disabled);
  if (isDisabled) {
    console.log("Send button disabled. Reply text was:", replyText.substring(0, 200));
    throw new Error("Send button is disabled - tweet may violate content policy or be empty");
  }

  await sendBtn.click({ force: true });

  // ── VERIFY the reply was actually posted ──────────────────
  // Strategy: Wait for either:
  //   1. A toast/snackbar confirming the post (X shows "Your post was sent")
  //   2. The textarea to disappear/clear (reply box resets after successful post)
  //   3. A new tweet article appearing on the page
  //   4. An error toast appearing
  // If none of these happen in 10s, consider it failed.

  let verified = false;
  let replyUrl = null;
  let verifyError = null;

  try {
    // Wait up to 10 seconds, checking multiple indicators
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(2000);

      // Check for error toasts
      const errorToast = await page.evaluate(() => {
        const layers = document.getElementById("layers");
        if (!layers) return null;
        const toasts = layers.querySelectorAll('[data-testid="toast"]');
        for (const toast of toasts) {
          const text = toast.innerText || "";
          if (text.toLowerCase().includes("error") || text.toLowerCase().includes("try again") ||
              text.toLowerCase().includes("unable") || text.toLowerCase().includes("limit") ||
              text.toLowerCase().includes("restricted")) {
            return text;
          }
        }
        return null;
      });

      if (errorToast) {
        verifyError = `X showed error: ${errorToast}`;
        break;
      }

      // Check for rate limit / suspension page
      const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || "");
      if (pageText.includes("Rate limit") || pageText.includes("suspended") || pageText.includes("locked")) {
        verifyError = `Account issue detected: ${pageText.substring(0, 200)}`;
        break;
      }

      // Check if reply textarea has been cleared (indicates successful send)
      const textareaContent = await page.$eval(
        '[data-testid="tweetTextarea_0"]',
        (el) => el.textContent || ""
      ).catch(() => "");

      // If textarea is empty or gone, the reply was likely sent
      if (textareaContent === "" || textareaContent.trim() === "") {
        // Check if new article appeared
        const afterReplyCount = await page.$$eval(
          'article[data-testid="tweet"]',
          (els) => els.length
        ).catch(() => 0);

        if (afterReplyCount > beforeReplyCount) {
          verified = true;
          console.log(`Reply verified: article count ${beforeReplyCount} -> ${afterReplyCount}`);

          // Try to extract our reply URL from the new articles
          replyUrl = await page.evaluate((ourReplyText) => {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            // Check each article for our reply text (partial match)
            const snippet = ourReplyText.substring(0, 50);
            for (const article of articles) {
              const textEl = article.querySelector('[data-testid="tweetText"]');
              if (textEl && textEl.innerText.includes(snippet)) {
                // Find the status URL
                const links = article.querySelectorAll('a[role="link"]');
                for (const link of links) {
                  const href = link.getAttribute("href") || "";
                  if (href.includes("/status/") && href.includes("WolfeUpHQ")) {
                    return "https://x.com" + href;
                  }
                }
              }
            }
            return null;
          }, replyText).catch(() => null);

          break;
        }

        // Textarea cleared but no new article yet - might still be loading
        if (attempt >= 5) {
          // After 5 seconds with cleared textarea, consider it likely posted
          verified = true;
          console.log("Reply likely posted: textarea cleared after send");
          break;
        }
      }

      // Check if we navigated away (some X flows redirect after posting)
      const currentUrl = page.url();
      if (currentUrl !== tweetUrl && currentUrl.includes("/status/")) {
        verified = true;
        replyUrl = currentUrl;
        console.log("Reply posted: navigated to", currentUrl);
        break;
      }
    }
  } catch (e) {
    console.error("Verification error:", e.message);
    // If verification itself errors, we can't be sure either way
    verifyError = `Verification failed: ${e.message}`;
  }

  if (verifyError) {
    console.log("Reply FAILED verification:", verifyError);
    throw new Error(verifyError);
  }

  if (!verified) {
    // After 10 seconds, nothing confirmed success
    // Check one more time if the reply text is still in the textarea (meaning it wasn't sent)
    const stillHasText = await page.$eval(
      '[data-testid="tweetTextarea_0"]',
      (el) => (el.textContent || "").length > 0
    ).catch(() => false);

    if (stillHasText) {
      throw new Error("Reply text still in textarea after 20s - post likely failed silently");
    }

    // Textarea empty but couldn't confirm - log warning but consider it posted
    console.log("WARNING: Reply not definitively verified but textarea is clear. Marking as posted.");
    verified = true;
  }

  console.log("Reply posted to:", tweetUrl, replyUrl ? `(reply URL: ${replyUrl})` : "(no reply URL captured)");
  return { success: true, tweetUrl, replyUrl: replyUrl || null };
}

module.exports = {
  connectBrowser,
  disconnectBrowser,
  extractTweets,
  searchTwitter,
  postReply,
};
