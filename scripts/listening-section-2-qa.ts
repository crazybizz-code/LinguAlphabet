/**
 * Offline validation and artifact generation for Listening Section 2.
 * Writes only to content/listening-section-2; no network, database or audio calls.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildListeningContractFromRows,
  isListeningChooseTwoGroup,
  validateListeningSection,
} from "@/lib/mock/content/validator";
import {
  LISTENING_SECTION_2,
  LISTENING_SECTION_2_DB_ROWS,
  SECTION_2_TRANSCRIPT,
} from "./listening-section-2-content";
import { LS2_QA_RECORDS } from "./listening-section-2-qa-metadata";

type Finding = { check: string; severity: "fail" | "warn" | "info"; detail: string };

const OUT_DIR = path.join(process.cwd(), "content", "listening-section-2");
const findings: Finding[] = [];
const add = (check: string, severity: Finding["severity"], detail: string) => {
  findings.push({ check, severity, detail });
};
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const ids = (pool: Array<{ id: string }>) => pool.map((option) => option.id);
const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const section = LISTENING_SECTION_2;
const groups = section.questionGroups;
const questions = groups.flatMap((group) => group.questions).sort((left, right) => left.order - right.order);
const spoken = SECTION_2_TRANSCRIPT.replace(/^[A-Z]+:\s*/gm, "");
const transcriptWordCount = words(spoken).length;

const contractErrors = validateListeningSection(section, "listening.sections[0]");
const persistedContract = buildListeningContractFromRows(
  [{ id: section.id, title: section.title, difficulty: section.difficulty }],
  LISTENING_SECTION_2_DB_ROWS,
);
const persistedSectionErrors = persistedContract.contract.sections[0]
  ? validateListeningSection(persistedContract.contract.sections[0], "listening.sections[0]")
  : [];
const persistedErrors = [...persistedContract.errors, ...persistedSectionErrors];
const persistedValidation = { valid: persistedErrors.length === 0, errors: persistedErrors };

// Structure and numbering.
if (questions.length !== 10) add("question-count", "fail", `Expected 10 questions, found ${questions.length}.`);
const expectedNumbers = Array.from({ length: 10 }, (_, index) => index + 11);
if (!sameJson(questions.map((question) => question.order), expectedNumbers)) {
  add("global-numbering", "fail", `Expected 11–20, found ${questions.map((question) => question.order).join(", ")}.`);
}
if (section.audioUrl !== null) add("audio", "fail", "audioUrl must remain null before audio production.");

// Choose-two representation.
const chooseTwoGroups = groups.filter((group) => isListeningChooseTwoGroup(group));
if (chooseTwoGroups.length !== 2) add("choose-two-count", "fail", `Expected 2 choose-two groups, found ${chooseTwoGroups.length}.`);
for (const group of chooseTwoGroups) {
  const groupRows = LISTENING_SECTION_2_DB_ROWS.filter((row) => row.mock_group_id === group.groupId);
  const poolIds = ids(group.optionPool ?? []);
  if (group.questions.length !== 2 || groupRows.length !== 2) {
    add("choose-two-size", "fail", `${group.groupId} does not contain exactly two contract and persisted rows.`);
  }
  if (!group.groupId.trim() || group.questions.some((question) => question.groupId !== group.groupId)) {
    add("choose-two-group-id", "fail", `${group.groupId} does not use one non-empty shared group id.`);
  }
  if (!sameJson(poolIds, ["A", "B", "C", "D", "E"])) {
    add("choose-two-pool", "fail", `${group.groupId} option IDs are ${poolIds.join(",")}, expected A–E.`);
  }
  if (groupRows.some((row) => !sameJson(row.option_pool, groupRows[0]?.option_pool))) {
    add("choose-two-shared-pool", "fail", `${group.groupId} persisted rows do not share an identical option pool.`);
  }
  if (new Set(group.questions.map((question) => question.correctAnswer)).size !== 2) {
    add("choose-two-distinct-answers", "fail", `${group.groupId} does not have two distinct correct options.`);
  }
  if (group.questions.some((question) => !poolIds.includes(question.correctAnswer))) {
    add("choose-two-answer-reference", "fail", `${group.groupId} has a correct answer outside A–E.`);
  }
  const sequences = group.questions.map((question) => question.order).sort((a, b) => a - b);
  if (sequences.length !== 2 || sequences[1] !== sequences[0] + 1) {
    add("choose-two-sequence", "fail", `${group.groupId} rows are not consecutive.`);
  }
  if (groupRows.some((row) => row.options !== null || row.type !== "multiple_choice")) {
    add("choose-two-representation", "fail", `${group.groupId} is not encoded as shared-pool multiple_choice rows.`);
  }
}

// Matching block.
const matchingGroups = groups.filter((group) => group.taskType === "matching");
if (matchingGroups.length !== 1) add("matching-group-count", "fail", `Expected one matching group, found ${matchingGroups.length}.`);
const matching = matchingGroups[0];
if (matching) {
  const poolIds = ids(matching.optionPool ?? []);
  if (!sameJson(matching.questions.map((question) => question.order), [15, 16, 17, 18, 19, 20])) {
    add("matching-rows", "fail", "Matching group must contain exactly Q15–20 in order.");
  }
  if (!sameJson(poolIds, ["A", "B", "C", "D", "E", "F", "G", "H", "I"])) {
    add("matching-pool", "fail", `Matching pool is ${poolIds.join(",")}, expected A–I.`);
  }
  if (matching.questions.some((question) => !poolIds.includes(question.correctAnswer))) {
    add("matching-answer-reference", "fail", "A matching answer points outside the shared A–I pool.");
  }
  const answers = matching.questions.map((question) => question.correctAnswer);
  if (new Set(answers).size !== answers.length) {
    add("matching-reuse", "fail", "Matching answers reuse a letter although the instructions require one use only.");
  }
}

// Transcript, evidence, distractors and recording order.
if (LS2_QA_RECORDS.length !== 10) add("qa-coverage", "fail", `Expected 10 QA records, found ${LS2_QA_RECORDS.length}.`);
for (const question of questions) {
  if (!LS2_QA_RECORDS.some((record) => record.q === question.order)) {
    add("qa-coverage", "fail", `Q${question.order} has no QA record.`);
  }
}
for (const record of LS2_QA_RECORDS) {
  if (!spoken.includes(record.evidence)) add("evidence-integrity", "fail", `Q${record.q} evidence is not verbatim transcript text.`);
  if (!record.rationale.trim()) add("answer-ambiguity", "fail", `Q${record.q} has no answer rationale.`);
  if (!record.ambiguityCheck.trim()) add("answer-ambiguity", "fail", `Q${record.q} has no ambiguity review.`);
  if (!record.distractor.trim() || record.distractorEvidence.length === 0) {
    add("distractor-quality", "fail", `Q${record.q} has no documented distractor.`);
  }
  for (const evidence of record.distractorEvidence) {
    if (!spoken.includes(evidence)) add("distractor-evidence", "fail", `Q${record.q} distractor evidence is not verbatim transcript text: ${evidence}`);
  }
}
const offsets = LS2_QA_RECORDS
  .slice()
  .sort((left, right) => left.q - right.q)
  .map((record) => ({ q: record.q, at: spoken.indexOf(record.evidence) }));
for (let index = 1; index < offsets.length; index += 1) {
  if (offsets[index].at <= offsets[index - 1].at) {
    add("recording-order", "fail", `Q${offsets[index].q} evidence is not after Q${offsets[index - 1].q}.`);
  }
}
add("recording-order", "info", `Answer offsets: ${offsets.map((item) => `Q${item.q}@${item.at}`).join(" ")}`);

// IELTS Part 2 register, context and difficulty.
const speakers = new Set((SECTION_2_TRANSCRIPT.match(/^[A-Z]+:/gm) ?? []).map((label) => label.slice(0, -1)));
if (speakers.size !== 1 || !speakers.has("MAYA")) add("monologue", "fail", `Expected one speaker (MAYA), found ${[...speakers].join(", ")}.`);
if (!/community hub/i.test(section.title ?? "") || !/open weekend|orientation/i.test(section.title ?? "")) {
  add("part-2-context", "fail", "Title does not identify an everyday community orientation context.");
}
if (transcriptWordCount < 550 || transcriptWordCount > 850) {
  add("pacing", "warn", `Transcript has ${transcriptWordCount} spoken words; review pacing before synthesis.`);
}
const difficultyCounts = Object.fromEntries(
  [...questions.reduce((counts, question) => counts.set(question.difficulty, (counts.get(question.difficulty) ?? 0) + 1), new Map<string, number>())].sort(),
);
if (questions.some((question) => !["B1", "B2"].includes(question.difficulty)) || !difficultyCounts.B1 || !difficultyCounts.B2) {
  add("difficulty", "fail", `Expected a B1/B2 mix, found ${JSON.stringify(difficultyCounts)}.`);
}
add("register", "info", `One-speaker social-context monologue; ${transcriptWordCount} spoken words; difficulty ${JSON.stringify(difficultyCounts)}.`);

const learnerArtifact = {
  title: "IELTS Listening — Section 2",
  context: "You will hear the manager of a community centre giving information about an open weekend.",
  totalQuestions: questions.length,
  tasks: groups.map((group) => ({
    groupId: group.groupId,
    instructions: group.instructions,
    answerMode: isListeningChooseTwoGroup(group) ? "choose exactly two" : "choose one letter for each question",
    optionPool: group.optionPool,
    questionNumbers: group.questions.map((question) => question.order),
    questions: group.taskType === "matching"
      ? group.questions.map((question) => ({ number: question.order, id: question.id, text: question.questionText }))
      : undefined,
  })),
};

const forbiddenLearnerKeys = new Set(["transcript", "correctAnswer", "correct_answer", "answer", "answers", "evidence", "rationale", "distractor"]);
function findForbiddenKeys(value: unknown, pathParts: string[] = []): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findForbiddenKeys(item, [...pathParts, String(index)]));
  if (typeof value !== "object" || value === null) return [];
  const leaks: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenLearnerKeys.has(key)) leaks.push([...pathParts, key].join("."));
    leaks.push(...findForbiddenKeys(nested, [...pathParts, key]));
  }
  return leaks;
}
const learnerLeaks = findForbiddenKeys(learnerArtifact);
if (learnerLeaks.length > 0) add("learner-leakage", "fail", `Forbidden learner-facing fields: ${learnerLeaks.join(", ")}.`);
if (JSON.stringify(learnerArtifact).includes(SECTION_2_TRANSCRIPT.slice(0, 80))) {
  add("transcript-leakage", "fail", "Learner-facing artifact contains transcript text.");
}

// Static side-effect gate: source files may import local types/validators only.
const sourceFiles = ["listening-section-2-content.ts", "listening-section-2-qa-metadata.ts"];
const sideEffectPattern = /\b(fetch|createClient|createServiceClient|OpenRouter|Gemini|FishAudio|generateAudio|synthesize)\s*\(/i;
for (const sourceFile of sourceFiles) {
  const source = readFileSync(path.join(process.cwd(), "scripts", sourceFile), "utf8");
  if (sideEffectPattern.test(source)) add("paid-call-safety", "fail", `${sourceFile} contains a network, database, AI or TTS call.`);
}
add("paid-call-safety", "info", "Artifact generation is local-only; no Supabase, network, AI or TTS client is invoked.");

const failures = findings.filter((finding) => finding.severity === "fail");
const warnings = findings.filter((finding) => finding.severity === "warn");

mkdirSync(OUT_DIR, { recursive: true });
const write = (name: string, value: unknown) => {
  writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
};

write("listening-section-2.json", {
  status: "SECTION 2 ONLY — transcript-first, not inserted, no audio generated",
  section,
  persistedQuestionRows: LISTENING_SECTION_2_DB_ROWS,
});
write("listening-section-2-learner-facing.json", learnerArtifact);
write("listening-section-2-answer-key.json", {
  title: "IELTS Listening Section 2 — answer key",
  totalMarks: questions.length,
  groups: groups.map((group) => ({
    groupId: group.groupId,
    range: `${group.questions[0].order}–${group.questions[group.questions.length - 1].order}`,
    answers: group.questions.map((question) => ({ number: question.order, id: question.id, answer: question.correctAnswer })),
  })),
});
write("listening-section-2-internal-qa.json", {
  title: "IELTS Listening Section 2 — internal QA",
  purpose: "Reviewer-only evidence, distractor and ambiguity record. Not for learners.",
  transcriptWordCount,
  items: LS2_QA_RECORDS.map((record) => ({
    ...record,
    answer: questions.find((question) => question.order === record.q)?.correctAnswer,
    transcriptOffset: spoken.indexOf(record.evidence),
  })),
  manualReviewQueue: LS2_QA_RECORDS.filter((record) => record.manualReview).map((record) => ({ q: record.q, note: record.manualReview })),
});
write("listening-section-2-validation-report.json", {
  generatedAt: new Date().toISOString(),
  scope: "Listening Section 2 only. Transcript-first; no audio, upload, database write or paid call.",
  validators: {
    contract: { entryPoint: "validateListeningSection", valid: contractErrors.length === 0, errors: contractErrors },
    persistedRows: { entryPoint: "buildListeningContractFromRows + validateListeningSection", valid: persistedValidation.valid, errors: persistedValidation.errors },
  },
  independentQA: {
    valid: failures.length === 0,
    failures,
    warnings,
    informational: findings.filter((finding) => finding.severity === "info"),
  },
  counts: {
    questions: questions.length,
    numbering: `${questions[0].order}–${questions[questions.length - 1].order}`,
    transcriptWordCount,
    speakers: [...speakers],
    difficulty: difficultyCounts,
    chooseTwoGroups: chooseTwoGroups.length,
    matchingRows: matching?.questions.length ?? 0,
    audioUrl: section.audioUrl,
  },
  databaseSideEffects: "none",
  paidCalls: "none",
});

console.log(`SECTION 2 VALIDATOR: ${contractErrors.length === 0 && persistedValidation.valid ? "PASS" : "FAIL"}`);
console.log(`INDEPENDENT QA: ${failures.length} failure(s), ${warnings.length} warning(s)`);
for (const finding of findings.filter((item) => item.severity !== "info")) {
  console.log(`  ${finding.severity.toUpperCase()} ${finding.check}: ${finding.detail}`);
}
console.log(`STRUCTURE: Q11–14 two choose-two groups; Q15–20 one A–I matching group`);
console.log(`ANSWERS: ${questions.map((question) => `${question.order}=${question.correctAnswer}`).join("  ")}`);
console.log(`TRANSCRIPT: ${transcriptWordCount} spoken words; one speaker; audioUrl=${section.audioUrl}`);
console.log(`ARTIFACTS: ${OUT_DIR}`);

if (contractErrors.length > 0 || !persistedValidation.valid || failures.length > 0) process.exitCode = 1;
