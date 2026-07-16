// Standalone diagnostic, not integrated anywhere -- no provider/pipeline
// changes, no extraction logic. Uses Playwright to open a real article
// page, click "Republish this article", and capture every network
// request made after that click -- this is the only way to find the
// real endpoint (if any) powering the republish modal, since static
// HTML/JS inspection already came up empty (no embedded republish HTML,
// no tracking pixel found server-side).
//
// Requires Playwright with a real browser installed locally:
//   npm install --no-save playwright
//   npx playwright install chromium
//
// Run: node scripts/check-conversation-republish-network.mjs

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const URL = "https://theconversation.com/could-count-binface-actually-win-287611";

async function dismissCookieBanner(page) {
  // Best-effort only -- a cookie-consent overlay intercepting the click
  // is the single most common reason a script like this silently fails,
  // so this is attempted but never assumed to exist.
  const candidates = ["Accept all", "Accept All", "I agree", "Agree", "Accept"];
  for (const text of candidates) {
    try {
      const button = page.getByRole("button", { name: text, exact: false }).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.click();
        console.log(`Dismissed cookie banner via button text: "${text}"`);
        return;
      }
    } catch {
      // not present, try the next candidate
    }
  }
  console.log("No cookie banner detected (or none matched known text) -- continuing.");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const requestLog = [];
  const responseBodies = new Map();
  let capturing = false;

  page.on("request", (request) => {
    if (!capturing) return;
    requestLog.push({ url: request.url(), method: request.method(), status: null, contentType: null });
  });

  page.on("response", async (response) => {
    if (!capturing) return;
    const url = response.url();
    const entry = [...requestLog].reverse().find((r) => r.url === url && r.status === null);
    const status = response.status();
    const contentType = response.headers()["content-type"] ?? "";
    if (entry) {
      entry.status = status;
      entry.contentType = contentType;
    }
    try {
      if (/html|text|json/i.test(contentType)) {
        const body = await response.text();
        responseBodies.set(url, { status, contentType, body });
      }
    } catch {
      // body unavailable (redirect, opaque response, etc.) -- skip
    }
  });

  console.log(`Navigating to ${URL}`);
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });

  await dismissCookieBanner(page);

  console.log("Looking for the 'Republish this article' trigger...");
  let republishLocator = page.getByText("Republish this article", { exact: false }).first();
  if ((await republishLocator.count()) === 0) {
    console.log("Text locator found nothing, trying role=button...");
    republishLocator = page.getByRole("button", { name: /republish/i }).first();
  }
  if ((await republishLocator.count()) === 0) {
    console.log("role=button found nothing, trying role=link...");
    republishLocator = page.getByRole("link", { name: /republish/i }).first();
  }
  if ((await republishLocator.count()) === 0) {
    console.log("NO REPUBLISH TRIGGER FOUND on the page with any of the tried locators. Stopping.");
    await browser.close();
    return;
  }

  await republishLocator.scrollIntoViewIfNeeded();
  console.log("Found a trigger. Starting network capture, then clicking...");
  capturing = true;
  await republishLocator.click();

  await page.waitForTimeout(4000);

  console.log(`\nCaptured ${requestLog.length} requests after the click:\n`);
  for (const r of requestLog) {
    console.log(`${r.method} ${r.url}`);
    console.log(`  status: ${r.status}, content-type: ${r.contentType}`);
  }

  let saved = false;
  for (const [url, { contentType, body }] of responseBodies.entries()) {
    const looksLikeHtmlContent = /html/i.test(contentType) && /<p[\s>]/i.test(body) && body.length > 500;
    if (looksLikeHtmlContent) {
      writeFileSync("republish-response.html", body, "utf-8");
      console.log(`\nSaved candidate response (${url}, ${body.length} chars) -> republish-response.html`);
      saved = true;
      break;
    }
  }
  if (!saved) {
    console.log("\nNo captured response body looked like article/republish HTML.");
    console.log("Check the request list above manually -- content may be JSON-wrapped, or rendered");
    console.log("entirely client-side from data already present on the page rather than fetched fresh.");
  }

  try {
    const domAfterClick = await page.content();
    writeFileSync("page-dom-after-click.html", domAfterClick, "utf-8");
    console.log("Saved full page DOM after the click -> page-dom-after-click.html (for manual inspection)");
  } catch (error) {
    console.log(`Could not capture DOM: ${error instanceof Error ? error.message : String(error)}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
