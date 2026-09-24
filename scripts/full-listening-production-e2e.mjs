// Production-backed Full Listening V1 browser E2E.
//
// This operator creates one throwaway authenticated learner, starts the full
// mock through the real UI, completes Listening with a controlled answer set,
// verifies the submitted rows directly, then removes the throwaway account.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ARTIFACT_DIR = "D:/Podcat app/full-listening-e2e-artifacts";
const PASSWORD = "FullListeningV1!2026";
const CAPTURE_VISUALS = process.env.E2E_CAPTURE_VISUALS === "1";

function loadEnv(path) {
  const out = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return out;
}

const env = loadEnv("D:/Podcat app/.env.local");
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment configuration");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function check(id, condition, detail) {
  const pass = Boolean(condition);
  results.push({ id, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id} - ${detail}`);
  if (!pass) throw new Error(`${id}: ${detail}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

async function waitForListeningSave(page, action) {
  const save = page.waitForResponse((response) => (
    response.url().endsWith("/api/mock/answer") && response.request().method() === "PUT"
  ), { timeout: 15_000 });
  await action();
  const response = await save;
  check("autosave response", response.ok(), `HTTP ${response.status()}`);
}

async function clickPalette(page, sequence) {
  await page.getByRole("button", { name: new RegExp(`^Question ${sequence}(?: \\(|$)`) }).click();
  await page.waitForTimeout(100);
}

async function fillCompletion(page, sequence, value) {
  const input = page.locator(`#listening-question-${sequence} input[type="text"]`);
  await waitForListeningSave(page, () => input.fill(value));
}

async function pickLetter(page, sequence, letter) {
  const article = page.locator(`#listening-question-${sequence}`);
  await waitForListeningSave(page, () => article.getByRole("button", { name: new RegExp(`^${letter}\\s`) }).click());
}

async function selectFlowchart(page, sequence, letter) {
  await waitForListeningSave(page, () => page.getByLabel(`Answer for question ${sequence}`).selectOption(letter));
}

async function selectChooseTwo(page, firstSequence, letters) {
  const group = page.locator(`#listening-question-${firstSequence}`);
  for (const letter of letters) {
    await waitForListeningSave(page, () => group.getByRole("checkbox").nth(letter.charCodeAt(0) - 65).click());
  }
}

let browser;
let userId;
let attemptId;
const email = `full-listening-v1-e2e-${Date.now()}@example.com`;
const consoleErrors = [];
const audioRequests = new Map();
const failedResponses = [];

try {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error("Test user was not created");
  userId = created.user.id;

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      username: "Listening V1 E2E",
      onboarding_completed: true,
      placement_completed: true,
      english_level: "B2",
      current_band: 6,
      target_band: 7,
    })
    .eq("user_id", userId);
  if (profileError) throw profileError;

  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    if (/mock-listening\/full-v1\/section-[1-4]\.mp3/.test(response.url())) {
      audioRequests.set(response.url(), response.status());
    }
  });

  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|profile)/, { timeout: 20_000 });
  check("authentication", page.url().endsWith("/dashboard"), "credentialed login reached the dashboard");
  const dashboardResponse = await page.goto(`${BASE_URL}/dashboard`);
  check("dashboard regression", dashboardResponse?.ok() && page.url().endsWith("/dashboard"), `HTTP ${dashboardResponse?.status()}`);
  const practiceResponse = await page.goto(`${BASE_URL}/practice`);
  check("practice route regression", practiceResponse?.ok() && page.url().endsWith("/practice"), `HTTP ${practiceResponse?.status()}`);

  await page.goto(`${BASE_URL}/mock`);
  await page.getByRole("heading", { name: "Full Mock Test" }).waitFor();
  check("full mock entry point", await page.getByRole("button", { name: "Start Full Mock" }).isVisible(), "full start action is visible");
  check("full mock duration copy", await page.getByText("85 minutes · answers auto-saved").isVisible(), "full Reading + Listening duration shown");

  await page.getByRole("button", { name: "Start Full Mock" }).click();
  await page.waitForURL(/\/mock\/[^/]+\/reading$/, { timeout: 30_000 });
  attemptId = page.url().match(/\/mock\/([^/]+)\/reading$/)?.[1];
  if (!attemptId) throw new Error("Could not resolve attempt id from Reading URL");

  const { data: attempt, error: attemptError } = await admin
    .from("full_mock_attempts")
    .select("id, user_id, reading_question_ids, listening_question_ids, reading_passage_ids, listening_section_ids")
    .eq("id", attemptId)
    .single();
  if (attemptError || !attempt) throw attemptError ?? new Error("Attempt not found");
  check("full attempt membership", attempt.listening_question_ids.length === 40, `${attempt.listening_question_ids.length} Listening questions`);
  check("Reading regression membership", attempt.reading_question_ids.length === 40 && attempt.reading_passage_ids.length === 3, `${attempt.reading_question_ids.length} questions / ${attempt.reading_passage_ids.length} passages`);
  check("four persisted sections", attempt.listening_section_ids.length === 4, `${attempt.listening_section_ids.length} sections`);

  if (CAPTURE_VISUALS) {
    await page.getByText("Question 1", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: /An environmental argument for looking backwards/ }).first().click();
    await page.getByRole("button", { name: "Flag question" }).first().click();
    await page.getByRole("button", { name: /An environmental argument for looking backwards/ }).nth(1).click();
    await page.getByRole("button", { name: "Flag question" }).first().click();
    await page.getByRole("button", { name: "Question 1 (answered) (flagged)" }).click();
    await page.getByRole("button", { name: "Question 1 (answered) (flagged)" }).waitFor();
    await page.screenshot({ path: `${ARTIFACT_DIR}/reading-desktop.png`, fullPage: false });
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.getByRole("button", { name: /questions/i }).click();
    check("Reading tablet width", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page overflow");
    await page.screenshot({ path: `${ARTIFACT_DIR}/reading-tablet.png`, fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: /questions/i }).click();
    check("Reading mobile width", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page overflow");
    await page.screenshot({ path: `${ARTIFACT_DIR}/reading-mobile.png`, fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Question 3", exact: true }).click();
    await page.screenshot({ path: `${ARTIFACT_DIR}/reading-active-unanswered-desktop.png`, fullPage: false });
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.screenshot({ path: `${ARTIFACT_DIR}/reading-active-unanswered-tablet.png`, fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${ARTIFACT_DIR}/reading-active-unanswered-mobile.png`, fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Question 1 (answered) (flagged)" }).click();
  }

  const { data: sections, error: sectionsError } = await admin
    .from("mock_listening_sections")
    .select("id, title, audio_url, approved, deprecated")
    .in("id", attempt.listening_section_ids);
  if (sectionsError) throw sectionsError;
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const orderedSections = attempt.listening_section_ids.map((id) => sectionById.get(id));
  check("section production state", orderedSections.every((section) => section?.approved && !section.deprecated), "all approved and non-deprecated");
  check("section audio mapping", orderedSections.every((section, index) => section?.audio_url?.endsWith(`/section-${index + 1}.mp3`)), orderedSections.map((section) => section?.audio_url).join(" | "));

  const { data: questions, error: questionsError } = await admin
    .from("assessment_questions")
    .select("id, type, mock_sequence, mock_group_id, mock_group_instructions, mock_listening_section_id, correct_answer, accepted_answers")
    .in("id", attempt.listening_question_ids);
  if (questionsError) throw questionsError;
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const orderedQuestions = attempt.listening_question_ids.map((id) => questionById.get(id));
  check("global Q1-Q40 ordering", orderedQuestions.every((question, index) => question?.mock_sequence === index + 1), `${orderedQuestions[0]?.mock_sequence}-${orderedQuestions.at(-1)?.mock_sequence}`);
  check("ten questions per section", attempt.listening_section_ids.every((sectionId) => orderedQuestions.filter((question) => question?.mock_listening_section_id === sectionId).length === 10), "10/10/10/10");
  check("group metadata", orderedQuestions.every((question) => question?.mock_group_id && question?.mock_group_instructions), "every imported question has its authored group and shared instruction");
  const expectedTypes = [
    ...Array(10).fill("form_note_table_flowchart_summary_completion"),
    ...Array(4).fill("multiple_choice"), ...Array(6).fill("matching"),
    ...Array(5).fill("form_note_table_flowchart_summary_completion"), ...Array(5).fill("matching"),
    ...Array(10).fill("form_note_table_flowchart_summary_completion"),
  ];
  check("question types", orderedQuestions.every((question, index) => question?.type === expectedTypes[index]), "completion / choose-two / matching / flowchart contracts aligned");
  check("section order", attempt.listening_section_ids.every((sectionId, index) => {
    const sequences = orderedQuestions.filter((question) => question?.mock_listening_section_id === sectionId).map((question) => question.mock_sequence);
    return Math.min(...sequences) === index * 10 + 1 && Math.max(...sequences) === index * 10 + 10;
  }), "Q1-10, Q11-20, Q21-30, Q31-40");

  await page.getByRole("button", { name: /Next: Listening/ }).click();
  await page.waitForURL(new RegExp(`/mock/${attemptId}/listening$`), { timeout: 20_000 });
  await page.getByText("Listening Section 1").waitFor();

  const htmlBeforeSubmission = await page.content();
  const transcriptSentinel = "Riverford Craft Fair, Tom speaking";
  check("no transcript leakage", !htmlBeforeSubmission.includes(transcriptSentinel) && !htmlBeforeSubmission.includes("transcript"), "learner DOM contains no transcript content/key");
  check("no answer-key leakage", !htmlBeforeSubmission.includes("correct_answer") && !htmlBeforeSubmission.includes("accepted_answers") && !htmlBeforeSubmission.includes('"correctAnswer"'), "learner DOM contains no answer fields");
  check("Q1-Q40 palette", await page.locator('footer button[aria-label^="Question "]').count() === 40, "40 global navigation buttons");

  if (CAPTURE_VISUALS) {
    await page.screenshot({ path: `${ARTIFACT_DIR}/listening-desktop.png`, fullPage: false });
    await page.setViewportSize({ width: 820, height: 1180 });
    check("Listening tablet width", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page overflow");
    await page.screenshot({ path: `${ARTIFACT_DIR}/listening-tablet.png`, fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    check("Listening mobile width", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page overflow");
    check("Listening mobile navigator", await page.locator('footer button[aria-label^="Question "]').count() === 40, "all 40 questions remain accessible");
    await page.screenshot({ path: `${ARTIFACT_DIR}/listening-mobile.png`, fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  // Audio: exercise every real public URL. Moving to another section unmounts
  // the prior player, while moving inside a section preserves its identity.
  for (const sectionNumber of [1, 2, 3, 4]) {
    const firstQuestion = 1 + (sectionNumber - 1) * 10;
    await clickPalette(page, firstQuestion);
    await page.getByText(`Listening Section ${sectionNumber}`).waitFor();
    const expectedGroupCount = [2, 3, 2, 2][sectionNumber - 1];
    check(`Section ${sectionNumber} groups`, await page.locator('section[aria-label^="Question group "]').count() === expectedGroupCount, `${expectedGroupCount} grouped blocks rendered`);
    if (CAPTURE_VISUALS && sectionNumber === 4) {
      const flowchartSelects = page.locator('select[aria-label^="Answer for question "]');
      const customChevrons = page.locator('select[aria-label^="Answer for question "] + svg');
      check("flowchart custom chevrons", await flowchartSelects.count() === await customChevrons.count(), "one custom chevron per select");
      await page.screenshot({ path: `${ARTIFACT_DIR}/listening-flowchart-desktop.png`, fullPage: false });
    }
    const expectedUrl = orderedSections[sectionNumber - 1].audio_url;
    await page.getByRole("button", { name: "Play audio" }).click();
    await page.waitForTimeout(750);
    let audioStatus = audioRequests.get(expectedUrl);
    if (!audioStatus) {
      audioStatus = await page.evaluate(async (url) => {
        const response = await fetch(url, { headers: { Range: "bytes=0-4095" } });
        return response.status;
      }, expectedUrl);
      audioRequests.set(expectedUrl, audioStatus);
    }
    check(`Section ${sectionNumber} audio`, [200, 206].includes(audioStatus), `${audioStatus} ${expectedUrl}`);
    if (sectionNumber === 1) {
      await clickPalette(page, 2);
      check("same-section audio identity", await page.getByRole("button", { name: "Already played" }).isVisible(), "Q1 to Q2 did not remount/reset audio");
    }
  }

  // Start persistence coverage in Section 1, including one review flag.
  await clickPalette(page, 1);
  await fillCompletion(page, 1, "baskets");
  await fillCompletion(page, 2, "three");
  await page.getByRole("button", { name: "Flag question 3" }).click();
  await page.waitForTimeout(250);
  const flagsBeforeReload = await page.evaluate((id) => sessionStorage.getItem(`mock_listening_flags_${id}`), attemptId);
  check("flag session persistence", flagsBeforeReload?.includes('"true"') || flagsBeforeReload?.includes(":true"), flagsBeforeReload ?? "missing sessionStorage value");
  await page.reload();
  await page.getByText("Listening Section 1").waitFor();
  check("refresh hydration Q1", await page.locator('#listening-question-1 input').inputValue() === "baskets", "saved free-text restored");
  check("refresh hydration Q2", await page.locator('#listening-question-2 input').inputValue() === "three", "accepted numeric form restored");
  const restoredFlag = page.getByRole("button", { name: "Unflag question 3" });
  await restoredFlag.waitFor({ state: "visible", timeout: 5_000 });
  check("refresh flag hydration", await restoredFlag.isVisible(), "session review flag restored");

  // Finish Section 1. Q10 deliberately remains unanswered.
  await fillCompletion(page, 3, "October");
  await fillCompletion(page, 4, "forty");
  await fillCompletion(page, 5, "table");
  await fillCompletion(page, 6, "nine");
  await fillCompletion(page, 7, "post");
  await fillCompletion(page, 8, "insurance certificate");
  await fillCompletion(page, 9, "market square");

  // Section 2 choose-two selections are intentionally clicked in reverse
  // correct-answer order, exercising deterministic persistence + set grading.
  await clickPalette(page, 11);
  await selectChooseTwo(page, 11, ["D", "B"]);
  await selectChooseTwo(page, 13, ["E", "C"]);
  for (const [sequence, letter] of [[15, "A"], [16, "H"], [17, "D"], [18, "I"], [19, "E"], [20, "F"]]) {
    await pickLetter(page, sequence, letter);
  }

  // Section 3 flowchart and matching.
  await clickPalette(page, 21);
  for (const [sequence, letter] of [[21, "D"], [22, "A"], [23, "G"], [24, "C"], [25, "E"]]) {
    await selectFlowchart(page, sequence, letter);
  }
  for (const [sequence, letter] of [[26, "G"], [27, "C"], [28, "D"], [29, "A"], [30, "E"]]) {
    await pickLetter(page, sequence, letter);
  }

  // Section 4 completion. Q39 is intentionally wrong.
  await clickPalette(page, 31);
  for (const [sequence, answer] of [
    [31, "sanitation"], [32, "maps"], [33, "gradient"], [34, "contamination"], [35, "ownership"],
    [36, "gentle bends"], [37, "native sedges"], [38, "temperature sensors"], [39, "wrong"], [40, "maintenance budget"],
  ]) {
    await fillCompletion(page, sequence, answer);
  }

  check("controlled answered count", await page.getByText("39/40 answered").isVisible(), "one unanswered; intentionally wrong Q39 still counts as answered");
  await clickPalette(page, 10);
  check("cross-section previous", await page.getByText("Listening Section 1").isVisible(), "Q11 to Q10 returns to Section 1");
  await clickPalette(page, 40);
  check("Q40 final navigation", await page.getByRole("button", { name: "Next question" }).isDisabled(), "Q40 is the final question");

  const submitResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/mock/submit"), { timeout: 30_000 });
  await page.getByRole("button", { name: "Submit Mock" }).click();
  const submitResponse = await submitResponsePromise;
  const submitJson = await submitResponse.json();
  check("submit API", submitResponse.ok(), `HTTP ${submitResponse.status()}`);
  check("controlled Listening score API", submitJson.listeningCorrect === 38 && submitJson.listeningTotal === 40, `${submitJson.listeningCorrect}/${submitJson.listeningTotal}`);
  await page.waitForURL(new RegExp(`/mock/${attemptId}/result$`), { timeout: 20_000 });
  check("result rendering", await page.getByText("38 / 40 correct").isVisible(), "Listening result is visible");

  const { data: finalAttempt, error: finalAttemptError } = await admin
    .from("full_mock_attempts")
    .select("status, reading_correct, reading_total, listening_correct, listening_total, listening_score_pct, overall_score_pct")
    .eq("id", attemptId)
    .single();
  if (finalAttemptError) throw finalAttemptError;
  check("persisted final score", finalAttempt.status === "submitted" && finalAttempt.listening_correct === 38 && finalAttempt.listening_total === 40, `${finalAttempt.listening_correct}/${finalAttempt.listening_total}, status=${finalAttempt.status}`);

  const { data: responses, error: responsesError } = await admin
    .from("full_mock_responses")
    .select("question_id, section, user_answer, is_correct, sequence_number")
    .eq("attempt_id", attemptId)
    .eq("section", "listening")
    .order("sequence_number");
  if (responsesError) throw responsesError;
  check("all Listening rows graded", responses.length === 40, `${responses.length} response rows including unanswered membership`);
  check("sequence mapping preserved", responses.every((response, index) => response.sequence_number === index + 1), "response rows are Q1-Q40");
  check("unanswered handling", responses[9].user_answer === null && responses[9].is_correct === false, "Q10 null graded false");
  check("wrong handling", responses[38].user_answer === "wrong" && responses[38].is_correct === false, "Q39 wrong graded false");
  check("accepted-answer normalization", [1, 3, 5].every((index) => responses[index].is_correct === true), "three/forty/nine accepted for numeric keys");
  check("choose-two unordered grading", responses.slice(10, 14).every((response) => response.is_correct === true), "both choose-two groups awarded 4/4");
  check("score ceiling", responses.filter((response) => response.is_correct).length === 38, "38 correct, never above 40");

  const isLocalRun = ["localhost", "127.0.0.1"].includes(new URL(BASE_URL).hostname);
  const ignoredLocalResponses = isLocalRun
    ? failedResponses.filter((response) => response.includes("/_vercel/insights/script.js"))
    : [];
  const unexpectedFailedResponses = failedResponses.filter((response) => !ignoredLocalResponses.includes(response));
  const relevantConsoleErrors = consoleErrors.filter((message) => {
    if (/favicon|AbortError|play\(\) request was interrupted/i.test(message)) return false;
    if (isLocalRun && message.includes("/_vercel/insights/script.js")) return false;
    return !(
      ignoredLocalResponses.length > 0
      && unexpectedFailedResponses.length === 0
      && message === "Failed to load resource: the server responded with a status of 404 (Not Found)"
    );
  });
  check("browser HTTP responses", unexpectedFailedResponses.length === 0, unexpectedFailedResponses.length ? unexpectedFailedResponses.join(" | ") : "no relevant failed responses");
  check("browser console", relevantConsoleErrors.length === 0, relevantConsoleErrors.length ? relevantConsoleErrors.join(" | ") : "no relevant errors");
  check("all four audio requests", audioRequests.size === 4, `${audioRequests.size}/4 production URLs requested`);

  const report = {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    attemptId,
    attemptFingerprint: sha256(attemptId),
    sectionIds: attempt.listening_section_ids,
    audio: orderedSections.map((section, index) => ({ section: index + 1, url: section.audio_url, httpStatus: audioRequests.get(section.audio_url) })),
    controlledScore: { listeningCorrect: 38, listeningTotal: 40, unanswered: 10, intentionallyWrong: 39 },
    results,
  };
  writeFileSync(`${ARTIFACT_DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`REPORT=${ARTIFACT_DIR}/report.json`);
} catch (error) {
  if (browser) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        await page.screenshot({ path: `${ARTIFACT_DIR}/failure.png`, fullPage: true }).catch(() => {});
      }
    }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (userId) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      console.error(`Throwaway user cleanup failed: ${cleanupError.message}`);
      process.exitCode = 1;
    } else {
      console.log(`CLEANUP=deleted throwaway user ${userId}`);
    }
  }
}
