// Production end-to-end reproduction/verification script. Walks the real
// deployed site through the exact demo path:
//   Login -> Dashboard -> Today's Mission -> Reading -> Dictionary ->
//   Vocabulary -> Flashcards -> Quiz -> Summary -> Finish Session ->
//   Mission Complete
// and separately checks every article card on Explore for a real
// thumbnail. Captures, at every step: console errors, failed network
// requests (status >= 400), and a screenshot into ./prod-e2e-shots/.
//
// Also explicitly detects a STALE DEPLOYMENT: if a Reflection step
// ("A Moment to Reflect") appears after the quiz, or Summary has no
// "Finish Session" button, production is NOT running the current main
// and no code-level debugging applies until it is redeployed.
//
// Setup:  npm install --no-save playwright && npx playwright install chromium
// Run:    LINGU_EMAIL=you@example.com LINGU_PASSWORD=... node scripts/prod-e2e-check.mjs
// Optional: LINGU_BASE_URL to override https://lingu-alphabet.vercel.app

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.LINGU_BASE_URL ?? "https://lingu-alphabet.vercel.app";
const EMAIL = process.env.LINGU_EMAIL;
const PASSWORD = process.env.LINGU_PASSWORD;
const SHOTS = "./prod-e2e-shots";

if (!EMAIL || !PASSWORD) {
  console.log("Set LINGU_EMAIL and LINGU_PASSWORD env vars first.");
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const failedRequests = [];
let shotIndex = 0;

async function shot(page, name) {
  shotIndex += 1;
  const path = `${SHOTS}/${String(shotIndex).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  console.log(`  [shot] ${path}`);
}

function fail(message) {
  console.log(`\nFAIL: ${message}`);
  console.log(`Console errors so far: ${consoleErrors.length ? consoleErrors.join(" | ") : "(none)"}`);
  console.log(`Failed requests so far: ${failedRequests.length ? failedRequests.join(" | ") : "(none)"}`);
  process.exitCode = 1;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(20000);
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url().slice(0, 160)}`);
  });

  console.log(`1. Login (${BASE}/login)`);
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await shot(page, "login");
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {});
  if (!page.url().includes("dashboard")) {
    await shot(page, "login-failed");
    return fail(`Login did not land on /dashboard (at: ${page.url()})`);
  }

  console.log("2. Dashboard / Today's Mission");
  await page.waitForTimeout(2000);
  await shot(page, "dashboard");
  const missionCta = page.getByRole("link", { name: /Start Learning|Resume Learning/ }).first();
  if (!(await missionCta.isVisible().catch(() => false))) {
    return fail("No Today's Mission CTA visible on Dashboard.");
  }
  const missionHref = await missionCta.getAttribute("href");
  console.log(`  mission href: ${missionHref}`);
  await missionCta.click();
  await page.waitForTimeout(2500);

  const stepFor = async () => {
    // Desktop stepper renders per-step labels; grab the highlighted one via the mobile caption if present, else infer from headings.
    const caption = await page.locator("text=/Step \\d+ of \\d+/").first().textContent({ timeout: 4000 }).catch(() => null);
    if (caption) return caption.split("·")[1]?.trim() ?? "?";
    return "?";
  };

  // Walk the session -- up to 15 transitions, bail out on anything unknown.
  const seen = [];
  for (let i = 0; i < 15; i++) {
    const label = await stepFor();
    if (seen[seen.length - 1] !== label) {
      seen.push(label);
      console.log(`3.${seen.length} step: ${label}`);
      await shot(page, `step-${label.toLowerCase().replace(/\s+/g, "-")}`);
    }

    // STALE BUILD DETECTOR
    if (await page.getByText("A Moment to Reflect").isVisible().catch(() => false)) {
      await shot(page, "STALE-reflection-step");
      return fail(
        "Reflection step encountered. Production is running a STALE build (pre-Finish-Session). Redeploy main on Vercel, then rerun this script.",
      );
    }

    if (label === "Listen") {
      return fail("Mission opened a PODCAST session -- cannot auto-complete audio gate. Pick an article mission (or complete an article via Explore) and rerun.");
    } else if (label === "Read") {
      await page.mouse.wheel(0, 20000);
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /Continue to Live Dictionary/ }).click();
    } else if (label === "Dictionary") {
      await page.getByRole("button", { name: /^Continue$/ }).click();
    } else if (label === "Vocabulary") {
      await page.getByRole("button", { name: /Start Flashcards/ }).click();
    } else if (label === "Flashcards") {
      for (let guard = 0; guard < 30; guard++) {
        const next = page.getByRole("button", { name: /Got it|Finish Review/ }).first();
        if (!(await next.isVisible().catch(() => false))) break;
        await next.click();
        await page.waitForTimeout(400);
      }
      await page.getByRole("button", { name: /^Continue$/ }).click();
    } else if (label === "Quiz") {
      for (let guard = 0; guard < 30; guard++) {
        const nextBtn = page.getByRole("button", { name: /Next Question|See Results/ });
        // answer: click the first enabled option button inside the quiz card
        const option = page.locator("button").filter({ hasNotText: /Next Question|See Results|Go back/ }).nth(1);
        await option.click().catch(() => {});
        await page.waitForTimeout(400);
        if (await nextBtn.isVisible().catch(() => false)) {
          const isLast = (await nextBtn.textContent())?.includes("See Results");
          await nextBtn.click();
          await page.waitForTimeout(500);
          if (isLast) break;
        }
      }
    } else if (label === "Summary") {
      const finish = page.getByRole("button", { name: /Finish Session/ });
      if (!(await finish.isVisible().catch(() => false))) {
        await shot(page, "STALE-summary-without-finish");
        return fail("Summary step has no 'Finish Session' button -- STALE deployment. Redeploy main, rerun.");
      }
      await finish.click();
      console.log("  clicked Finish Session, waiting up to 20s for completion...");
      const completed = await page
        .getByText("Mission Complete!")
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      await shot(page, completed ? "mission-complete" : "STUCK-after-finish");
      if (!completed) {
        return fail("Clicked Finish Session but 'Mission Complete!' never appeared -- THE BUG REPRODUCED. Send the console errors + failed requests below plus the screenshots.");
      }
      console.log("4. Mission Complete reached.");
      break;
    } else {
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(700);
  }

  console.log("\n5. Explore thumbnails");
  await page.goto(`${BASE}/explore`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const articlesTab = page.getByRole("button", { name: /Articles/ }).first();
  if (await articlesTab.isVisible().catch(() => false)) await articlesTab.click();
  await page.waitForTimeout(2000);
  await shot(page, "explore-articles");
  const cardImages = await page.locator('a[href*="/article/"] img').count();
  const cards = await page.locator('a[href*="/article/"]').count();
  console.log(`  article cards: ${cards}, cards with a real <img>: ${cardImages}`);
  if (cards === 0) console.log("  NOTE: zero article cards -- catalog empty (re-ingest not run?)");
  else if (cardImages < cards) console.log(`  NOTE: ${cards - cardImages} card(s) still placeholder -- their DB rows have empty thumbnail_url (re-ingest needed after the extraction fix deploys).`);

  console.log(`\nConsole errors: ${consoleErrors.length ? "\n  " + consoleErrors.join("\n  ") : "(none)"}`);
  console.log(`Failed requests: ${failedRequests.length ? "\n  " + failedRequests.join("\n  ") : "(none)"}`);
  console.log("\nDONE. Screenshots in ./prod-e2e-shots/");
  await browser.close();
}

main().catch((error) => {
  fail(`Script crashed: ${error instanceof Error ? error.stack : String(error)}`);
});
