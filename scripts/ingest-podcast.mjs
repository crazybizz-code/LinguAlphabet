#!/usr/bin/env node
/**
 * Human-in-the-loop podcast intake CLI.
 *
 * Submits one episode (audio URL + transcript file + metadata) to
 * /api/content-engine/podcasts, which verifies the transcript belongs to
 * that episode before running AI enrichment. Prints the per-check
 * verification report either way, so a rejection is actionable.
 *
 * Usage:
 *   node scripts/ingest-podcast.mjs \
 *     --title "Climate Adaptation in Coastal Cities" \
 *     --audio https://cdn.example.com/ep12.mp3 \
 *     --duration 1830 \
 *     --transcript ./transcripts/ep12.txt \
 *     [--description "Show notes..."] \
 *     [--thumbnail https://.../cover.jpg] \
 *     [--published 2026-07-30] \
 *     [--draft]            # stage as draft instead of publishing
 *     [--base https://linguabc.example.com]   # defaults to localhost:3000
 *
 * Auth: set CRON_SECRET in the environment (same secret the scheduled
 * article ingest uses); sent as a bearer token.
 */
import { readFile } from "node:fs/promises";

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const title = arg("title");
const audioUrl = arg("audio");
const duration = arg("duration");
const transcriptPath = arg("transcript");

if (!title || !audioUrl || !duration || !transcriptPath) {
  fail("Required: --title, --audio, --duration (seconds), --transcript <file>. See the header of this script for full usage.");
}

const durationSeconds = Number(duration);
if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
  fail(`--duration must be a positive number of seconds (got "${duration}").`);
}

let transcript;
try {
  transcript = await readFile(transcriptPath, "utf8");
} catch (error) {
  fail(`Could not read transcript file "${transcriptPath}": ${error.message}`);
}

const baseUrl = arg("base", "http://localhost:3000");
const payload = {
  title,
  audioUrl,
  durationSeconds,
  transcript,
  description: arg("description"),
  thumbnailUrl: arg("thumbnail"),
  publishedAt: arg("published"),
  externalId: arg("external-id"),
  autoPublish: arg("draft") ? false : undefined,
};

const headers = { "Content-Type": "application/json" };
if (process.env.CRON_SECRET) headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;

console.log(`\nSubmitting "${title}" (${Math.round(durationSeconds / 60)} min) …`);

const response = await fetch(`${baseUrl}/api/content-engine/podcasts`, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});

const result = await response.json().catch(() => ({}));

if (result.verification?.checks) {
  console.log(`\nTranscript verification — confidence ${(result.verification.confidence * 100).toFixed(0)}%`);
  for (const check of result.verification.checks) {
    const mark = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✗";
    console.log(`  ${mark} ${check.id}: ${check.detail}`);
  }
}

if (response.ok) {
  console.log(`\n✓ Published as ${result.contentItemId}\n`);
  process.exit(0);
}

console.error(`\n✗ Rejected at stage: ${result.stage ?? `HTTP ${response.status}`}`);
for (const reason of result.reasons ?? [result.error ?? "unknown error"]) {
  console.error(`  - ${reason}`);
}
console.error("");
process.exit(1);
