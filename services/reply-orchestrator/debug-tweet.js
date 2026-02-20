const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || "http://localhost:9222", { timeout: 5000 });
  const ctx = browser.contexts()[0];
  let page = null;
  for (const p of ctx.pages()) {
    const u = p.url();
    if (u.includes("x.com") && !u.includes("flow/login") && !u.includes("accounts.google") && !u.includes("blob:")) {
      page = p;
      break;
    }
  }
  if (!page) {
    console.log("No X page found");
    await browser.close();
    return;
  }
  page.on("dialog", async (d) => await d.dismiss().catch(() => {}));

  console.log("Navigating to tweet...");
  await page.goto("https://x.com/damianplayer/status/2023739032459624849", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);
  console.log("URL:", page.url());

  // Check for all data-testid elements related to text/reply
  const testids = await page.evaluate(() => {
    const els = document.querySelectorAll("[data-testid]");
    return Array.from(els).map((e) => ({
      id: e.getAttribute("data-testid"),
      tag: e.tagName,
      role: e.getAttribute("role"),
      visible: e.offsetHeight > 0,
    }));
  });

  const relevant = testids.filter(
    (t) =>
      t.id.includes("tweet") ||
      t.id.includes("reply") ||
      t.id.includes("Reply") ||
      t.id.includes("Text") ||
      t.id.includes("textbox") ||
      t.id.includes("Textarea")
  );
  console.log("Relevant testIDs:", JSON.stringify(relevant, null, 2));

  // Also check for any role=textbox elements
  const textboxes = await page.evaluate(() => {
    const els = document.querySelectorAll('[role="textbox"]');
    return Array.from(els).map((e) => ({
      tag: e.tagName,
      testid: e.getAttribute("data-testid"),
      placeholder: e.getAttribute("placeholder") || e.getAttribute("data-placeholder"),
      visible: e.offsetHeight > 0,
      className: e.className?.slice(0, 50),
    }));
  });
  console.log("Textboxes:", JSON.stringify(textboxes, null, 2));

  await browser.close();
})().catch((e) => console.error("Error:", e.message));
