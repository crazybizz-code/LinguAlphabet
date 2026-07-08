// Transforms the 13 real BBC podcasts (content/legacy-podcast-lessons) into
// the universal content_items + podcast_details shape (supabase/content-schema.sql,
// src/types/content.ts). Two outputs, both generated — never hand-edit them:
//   - supabase/seed-content.sql   (run against the live Supabase project)
//   - src/lib/content/seed-data.ts (source data for the local dev-preview
//     harness only — no production page may import it; see that file's header)
//
// Run: node scripts/build-podcast-seed.mjs

import { newBbcPodcasts, newBbcOfficialTranscripts } from "../content/legacy-podcast-lessons/generated/newBbcLessons.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// lessonCategory -> our controlled onboarding-interests vocabulary. Not every
// BBC category has a clean match — left unmapped (no topic) rather than
// forced, per docs/domain-model.md's "topics don't need to be populated for
// every item" note.
const TOPIC_MAP = {
  "Travel English": "Travel",
  Food: "Food",
  Science: "Science",
  Space: "Science",
  Money: "Business",
};

// targetGoals -> our controlled onboarding Goal vocabulary.
const GOAL_MAP = {
  "General English": "General English",
  "Travel English": "Travel",
  "Speaking Fluency": "Speaking",
  "Business English": "Business English",
  "Academic English": "School",
};

// Same weighted-estimate timing algorithm as data.js's buildOfficialTranscript
// (the 5 hand-authored lessons), applied here to the 13 imported lessons,
// whose own transcript timing is still "pending-forced-alignment" (0/1ms
// placeholders) — this gives them a real, reasonable estimate instead.
function getTimingWeight(segment, previousSegment) {
  const words = segment.text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length || 1;
  const sentences = Math.max(1, (segment.text.match(/[.!?]+/g) || []).length);
  const commas = (segment.text.match(/[,;:]/g) || []).length;
  const ellipses = (segment.text.match(/\.{2,}|…/g) || []).length;
  const dashes = (segment.text.match(/[–—-]/g) || []).length;
  const hasQuestion = /[?]/.test(segment.text);
  const speakerChanged = previousSegment && previousSegment.speaker !== segment.speaker;

  return (
    words +
    sentences * 2.4 +
    commas * 0.9 +
    ellipses * 2.2 +
    dashes * 1.1 +
    (hasQuestion ? 1.4 : 0) +
    (speakerChanged ? 1.8 : 0) +
    (words <= 3 ? 1.5 : 0)
  );
}

function estimateTiming(segments, durationMs) {
  const weights = segments.map((segment, index) => getTimingWeight(segment, segments[index - 1]));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || segments.length || 1;
  let elapsed = 0;

  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const startMs = Math.round((elapsed / totalWeight) * durationMs);
    elapsed += weights[index];
    const endMs = isLast ? durationMs : Math.max(startMs + 1, Math.round((elapsed / totalWeight) * durationMs));
    return { speaker: segment.speaker, text: segment.text, startMs, endMs };
  });
}

function buildReflection(podcast) {
  return `${podcast.objective} What's one thing from this lesson you could use in your own conversations this week?`;
}

// The 13 imported lessons' own `quizQuestions` are low-quality auto-generated
// placeholders (distractor options unrelated to the lesson topic — e.g. a
// beach-lesson question offering "Buying a car" as an option). Build
// topically-coherent multiple-choice questions instead, straight from each
// lesson's own flashcards: the correct answer is a real word's real
// definition, and distractors are OTHER real words' definitions from the same
// lesson, so every option is at least plausible. Deterministic (no RNG) so
// re-running the script produces identical output.
function buildQuiz(podcast) {
  const vocab = podcast.flashcards || [];
  if (vocab.length < 2) return [];

  const count = Math.min(4, vocab.length);
  return Array.from({ length: count }, (_, i) => {
    const target = vocab[i];
    const distractors = vocab
      .filter((_, idx) => idx !== i)
      .map((entry) => entry.definition)
      .slice(0, 3);
    const options = [target.definition, ...distractors];
    // Rotate so the correct answer isn't always option 0.
    const rotate = i % options.length;
    const rotated = [...options.slice(rotate), ...options.slice(0, rotate)];

    return {
      type: "mc",
      question: `What does "${target.word}" mean in this lesson?`,
      options: rotated,
      correct: rotated.indexOf(target.definition),
      explanation: `"${target.word}" means: ${target.definition}`,
    };
  });
}

function mapTopics(podcast) {
  const topics = new Set();
  if (TOPIC_MAP[podcast.lessonCategory]) topics.add(TOPIC_MAP[podcast.lessonCategory]);
  return [...topics];
}

function mapGoals(podcast) {
  const goals = new Set();
  for (const goal of podcast.targetGoals || []) {
    if (GOAL_MAP[goal]) goals.add(GOAL_MAP[goal]);
  }
  return [...goals];
}

function sqlString(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlArray(values) {
  if (!values || values.length === 0) return "'{}'";
  return `ARRAY[${values.map((v) => sqlString(v)).join(", ")}]::text[]`;
}

function sqlJson(value) {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

const items = newBbcPodcasts.map((podcast, index) => {
  const transcript = newBbcOfficialTranscripts[podcast.transcriptId];
  const durationSeconds = Math.round(podcast.duration * 60);
  const estimatedSegments = estimateTiming(transcript.content, durationSeconds * 1000);

  return {
    id: podcast.podcastId,
    contentType: "podcast",
    title: podcast.title,
    description: podcast.description,
    cefrLevel: podcast.cefrLevel,
    topics: mapTopics(podcast),
    skills: podcast.skills,
    goalAlignment: mapGoals(podcast),
    tags: [podcast.category, podcast.lessonCategory, ...podcast.keywords],
    estimatedTimeMinutes: podcast.duration,
    thumbnailUrl: podcast.coverImage,
    // First 3 alternate as "featured" so Home/Explore have something to promote.
    featured: index < 3,
    publishedAt: podcast.createdAt,
    audioUrl: podcast.audioUrl,
    durationSeconds,
    transcript: estimatedSegments,
    summary: podcast.summary,
    takeaways: podcast.takeaways,
    vocabulary: podcast.flashcards,
    quiz: buildQuiz(podcast),
    reflection: buildReflection(podcast),
  };
});

// ---- supabase/seed-content.sql ----
const sqlLines = [
  "-- Generated by scripts/build-podcast-seed.mjs from content/legacy-podcast-lessons.",
  "-- Do not edit manually. Re-run the script after changing the source lessons.",
  "-- Run after supabase/content-schema.sql.",
  "",
];

for (const item of items) {
  sqlLines.push(
    `insert into public.content_items (id, content_type, title, description, cefr_level_min, cefr_level_max, topics, skills, goal_alignment, tags, estimated_time_minutes, thumbnail_url, status, featured, published_at) values (`,
    `  ${sqlString(item.id)}, ${sqlString(item.contentType)}, ${sqlString(item.title)}, ${sqlString(item.description)},`,
    `  ${sqlString(item.cefrLevel)}, ${sqlString(item.cefrLevel)}, ${sqlArray(item.topics)}, ${sqlArray(item.skills)}, ${sqlArray(item.goalAlignment)}, ${sqlArray(item.tags)},`,
    `  ${item.estimatedTimeMinutes}, ${sqlString(item.thumbnailUrl)}, 'published', ${item.featured}, ${sqlString(item.publishedAt)}`,
    `) on conflict (id) do update set title = excluded.title, description = excluded.description;`,
    "",
    `insert into public.podcast_details (content_item_id, audio_url, duration_seconds, transcript, summary, takeaways, vocabulary, quiz, reflection) values (`,
    `  ${sqlString(item.id)}, ${sqlString(item.audioUrl)}, ${item.durationSeconds},`,
    `  ${sqlJson(item.transcript)},`,
    `  ${sqlString(item.summary)},`,
    `  ${sqlJson(item.takeaways)},`,
    `  ${sqlJson(item.vocabulary)},`,
    `  ${sqlJson(item.quiz)},`,
    `  ${sqlString(item.reflection)}`,
    `) on conflict (content_item_id) do update set transcript = excluded.transcript, summary = excluded.summary, takeaways = excluded.takeaways, vocabulary = excluded.vocabulary, quiz = excluded.quiz, reflection = excluded.reflection;`,
    "",
  );
}

writeFileSync(path.join(ROOT, "supabase/seed-content.sql"), sqlLines.join("\n"));

// ---- src/lib/content/seed-data.ts ----
const tsLines = [
  "// Generated by scripts/build-podcast-seed.mjs from content/legacy-podcast-lessons.",
  "// Do not edit manually. Re-run the script after changing the source lessons.",
  "//",
  "// This is NOT a production data source — no route/page may import it. It",
  "// exists only so the local dev-preview harness (deleted before final commit,",
  "// same pattern as src/app/dev-preview during the foundation phase) can",
  "// render real content while this sandbox cannot reach Supabase. The real",
  "// data source is supabase/seed-content.sql, run against the live project.",
  "",
  'import type { PodcastContent } from "@/types/content";',
  "",
  `export const seedPodcasts: PodcastContent[] = ${JSON.stringify(
    items.map((item) => ({
      id: item.id,
      contentType: "podcast",
      title: item.title,
      description: item.description,
      cefrLevelMin: item.cefrLevel,
      cefrLevelMax: item.cefrLevel,
      topics: item.topics,
      skills: item.skills,
      goalAlignment: item.goalAlignment,
      tags: item.tags,
      estimatedTimeMinutes: item.estimatedTimeMinutes,
      thumbnailUrl: item.thumbnailUrl,
      status: "published",
      featured: item.featured,
      premium: false,
      publishedAt: item.publishedAt,
      audioUrl: item.audioUrl,
      durationSeconds: item.durationSeconds,
      transcript: item.transcript,
      summary: item.summary,
      takeaways: item.takeaways,
      vocabulary: item.vocabulary,
      quiz: item.quiz,
      reflection: item.reflection,
    })),
    null,
    2,
  )};`,
  "",
];

writeFileSync(path.join(ROOT, "src/lib/content/seed-data.ts"), tsLines.join("\n"));

console.log(`Generated seed for ${items.length} podcasts.`);
console.log("  -> supabase/seed-content.sql");
console.log("  -> src/lib/content/seed-data.ts");
