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
    console.log("No X page, listing all:");
    for (const p of ctx.pages()) console.log("  -", p.url().slice(0, 100));
    await browser.close();
    return;
  }
  page.on("dialog", async (d) => await d.dismiss().catch(() => {}));

  await page.goto("https://x.com/damianplayer/status/2023739032459624849", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(10000);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log("URL:", page.url());
  console.log("Body text:", bodyText);

  const allTestIds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-testid]")).map(e => e.getAttribute("data-testid"));
  });
  console.log("All testIDs:", [...new Set(allTestIds)].join(", "));

  await browser.close();
})().catch((e) => console.error("Error:", e.message));
