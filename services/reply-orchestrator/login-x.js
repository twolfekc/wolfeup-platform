const { chromium } = require("playwright-core");

const CDP_URL = process.env.CDP_URL || "http://localhost:9222";

async function loginToX() {
  console.log("Connecting to Chrome CDP...");
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 10000 });
  const ctx = browser.contexts()[0];

  // Find or create a page for login
  let page = null;
  for (const p of ctx.pages()) {
    const url = p.url();
    if (url.includes("x.com")) {
      page = p;
      break;
    }
  }
  if (!page) {
    page = await ctx.newPage();
  }

  // Navigate to login
  console.log("Navigating to X login...");
  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Enter email
  console.log("Entering email...");
  const emailInput = await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
  await emailInput.click();
  await emailInput.fill("wolfeupkc@gmail.com");
  await page.waitForTimeout(500);

  // Click Next
  const nextButtons = await page.$$('button');
  for (const btn of nextButtons) {
    const text = await btn.innerText().catch(() => "");
    if (text.trim() === "Next") {
      await btn.click();
      break;
    }
  }
  await page.waitForTimeout(3000);

  // Check if username verification is needed
  const currentText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("After next:", currentText.slice(0, 200));

  if (currentText.includes("Enter your phone number or username")) {
    console.log("Username verification needed, entering username...");
    const usernameInput = await page.waitForSelector('input[data-testid="ocfEnterTextTextInput"]', { timeout: 10000 });
    await usernameInput.fill("WolfeUpHQ");
    await page.waitForTimeout(500);

    const nextBtns2 = await page.$$('button');
    for (const btn of nextBtns2) {
      const text = await btn.innerText().catch(() => "");
      if (text.trim() === "Next") {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(3000);
  }

  // Enter password
  console.log("Entering password...");
  const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await passwordInput.click();
  await passwordInput.fill("Aspenworldpeace2026!!");
  await page.waitForTimeout(500);

  // Click Log in
  const loginBtns = await page.$$('button[data-testid="LoginForm_Login_Button"]');
  if (loginBtns.length > 0) {
    await loginBtns[0].click();
  } else {
    // Fallback: find button with "Log in" text
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
      const text = await btn.innerText().catch(() => "");
      if (text.trim() === "Log in") {
        await btn.click();
        break;
      }
    }
  }

  console.log("Waiting for login to complete...");
  await page.waitForTimeout(8000);

  const finalUrl = page.url();
  const finalTitle = await page.title();
  console.log("Final URL:", finalUrl);
  console.log("Final title:", finalTitle);

  if (finalUrl.includes("x.com/home") || finalUrl.includes("x.com/") && !finalUrl.includes("login")) {
    console.log("LOGIN SUCCESS!");
  } else {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log("Body:", bodyText);
  }

  await browser.close();
}

loginToX().catch(e => console.error("Login error:", e.message));
