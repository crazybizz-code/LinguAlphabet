import { describe, it, expect } from "vitest";
import { parseVoaFeed, VOA_ATTRIBUTION, VOA_LICENCE } from "@/lib/content-engine/providers/voa-provider";
import { VOA_PROGRAMMES, findVoaProgramme, voaFeedUrl } from "@/lib/content-engine/providers/voa-programmes";
import { classifyFeed } from "@/lib/content-engine/providers/voa-discovery";
import { createWhisperTranscriber } from "@/lib/content-engine/transcripts/asr";
import { resolveTranscript } from "@/lib/content-engine/transcripts/resolve";
import { verifyTranscript } from "@/lib/content-engine/transcripts/verify";
import { getAdapter } from "@/lib/content-engine/adapters/registry";
import { runQualityGate } from "@/lib/content-engine/publishing";
import { isReachableAudio } from "@/lib/content-engine/audio";
import { resolveDescription } from "@/lib/content-engine/description";
import { generateEnrichment } from "@/lib/content-engine/ai-processing";

/**
 * OPERATOR ASR PROOF — real VOA feed, real MP3s, real transcription.
 *
 * Opt-in: skipped entirely unless VOA_ASR_PROOF=1, so `npm test` and CI
 * never download a model or an episode.
 *
 *   Three As It Is episodes (the first proof):
 *     VOA_ASR_PROOF=1 npx vitest run scripts/verify-voa-asr-dry-run.test.ts
 *
 *   One episode from each of the other five programmes:
 *     VOA_ASR_PROOF=1 VOA_ASR_ZONES=986,1581,5535,4456,7468 VOA_ASR_PER_ZONE=1 \
 *       npx vitest run scripts/verify-voa-asr-dry-run.test.ts
 *
 * REQUIRES: python3 with faster-whisper installed, and ffmpeg on PATH.
 *     pip install faster-whisper
 *
 * WRITES NOTHING TO THE CATALOG. No Supabase client is constructed, no
 * content_items or podcast_details row is touched, and no Gemini call is
 * made — the post-enrichment fields the gate needs (CEFR, topics,
 * estimated time) are stubbed and labelled as such. Transcripts ARE
 * written, to the local .asr-cache directory, which is the point: a
 * second run must not pay for transcription again.
 */

const ENABLED = process.env.VOA_ASR_PROOF === "1";
const ZONES = (process.env.VOA_ASR_ZONES ?? "3521").split(",").map((zone) => Number(zone.trim()));
const PER_ZONE = Number(process.env.VOA_ASR_PER_ZONE ?? 3);
const MODEL = process.env.VOA_ASR_MODEL ?? "medium.en";
/** Real Gemini enrichment, one call per episode. Off by default so the proof costs nothing. */
const ENRICH = process.env.VOA_ASR_ENRICH === "1";

interface EpisodeReport {
  programme: string;
  title: string;
  outcome: "would_publish" | "rejected";
  reasons: string[];
  audioUrl?: string;
  audioValidated: boolean;
  statedDurationSeconds?: number;
  decodedDurationSeconds?: number | null;
  asrCompleted: boolean;
  cacheHit?: boolean;
  wordCount?: number;
  timestampCoverage?: number;
  transcriptVerified: boolean;
  verificationConfidence?: number;
  /** Which elements the publisher's own <item> actually contains - answers "does VOA publish a description anywhere" from the bytes. */
  itemElements?: string[];
  descriptionProvenance?: string;
  description?: string;
  gatePassed: boolean;
  elapsedMs?: number;
}

function pct(value: number | undefined): string {
  return value === undefined ? "n/a" : `${Math.round(value * 100)}%`;
}

describe.skipIf(!ENABLED)("VOA ASR proof", () => {
  it(
    "fetches, transcribes, verifies and gates real episodes without writing to the catalog",
    async () => {
      const lines: string[] = [];
      const log = (line = "") => lines.push(line);
      const transcribe = createWhisperTranscriber({ model: MODEL });
      const reports: EpisodeReport[] = [];

      log(`MODEL ${MODEL}   ZONES ${ZONES.join(", ")}   ${PER_ZONE} episode(s) per zone`);
      log();

      for (const zoneId of ZONES) {
        const programme = findVoaProgramme(zoneId)?.name ?? `zone ${zoneId}`;
        const feedUrl = voaFeedUrl(zoneId);

        const response = await fetch(feedUrl, {
          headers: { accept: "application/rss+xml, application/xml, text/xml" },
        });
        log(`FEED  ${programme}  ${feedUrl}`);
        log(`      HTTP ${response.status}`);
        expect(response.ok, `Feed returned HTTP ${response.status}`).toBe(true);

        const xml = await response.text();

        // The source check that stopped us ingesting VOA's Top Stories
        // feed. Still runs here — a programme that stops being a podcast
        // feed must abort, not degrade.
        const classification = classifyFeed(xml);
        log(`      channel "${classification.channelTitle}"  items=${classification.itemCount}  audio=${classification.audioEnclosures}`);
        expect(classification.isPodcastFeed, `Not a podcast feed: ${classification.reasons.join("; ")}`).toBe(true);

        const items = parseVoaFeed(xml).slice(0, PER_ZONE);
        log(`      parsed episodes: ${items.length}`);
        log();

        for (const raw of items) {
          const report: EpisodeReport = {
            programme,
            title: raw.title,
            outcome: "rejected",
            reasons: [],
            audioValidated: false,
            asrCompleted: false,
            transcriptVerified: false,
            gatePassed: false,
            audioUrl: raw.audio?.url,
            statedDurationSeconds: raw.audio?.durationSeconds,
          };
          reports.push(report);

          // Every child element of the publisher's own <item>. This is
          // how we answer "does VOA publish a description under some
          // other name" from the feed itself rather than by guessing at
          // element names.
          const itemXml = (raw.raw as { feedItem?: string } | undefined)?.feedItem ?? "";
          report.itemElements = [...new Set([...itemXml.matchAll(/<([a-zA-Z][\w:.-]*)[\s/>]/g)].map((m) => m[1]))].sort();

          // ---------- Audio validation ----------
          if (!raw.audio?.url) {
            report.reasons.push("No <enclosure> audio URL");
            continue;
          }
          const probe = await isReachableAudio(raw.audio.url);
          if (!probe.ok) {
            report.reasons.push(probe.reason ?? "Audio unreachable");
            continue;
          }
          report.audioValidated = true;

          // ---------- ASR ----------
          const startedAt = Date.now();
          const asr = await transcribe(raw.audio.url, raw.audio.durationSeconds);
          report.elapsedMs = Date.now() - startedAt;

          if (!asr) {
            report.reasons.push(
              "ASR produced nothing (check: pip install faster-whisper, ffmpeg on PATH, and the [asr] stderr line above)",
            );
            continue;
          }
          report.asrCompleted = true;
          report.cacheHit = asr.cacheHit;
          report.wordCount = asr.wordCount;
          report.timestampCoverage = asr.timestampCoverage;
          report.decodedDurationSeconds = asr.audioSeconds;

          // ---------- Verification (UNCHANGED, and it runs AFTER ASR) ----------
          const segments = await resolveTranscript(raw, { transcribe });
          if (!segments) {
            // Re-run the verifier purely to report WHICH check failed.
            const detail = verifyTranscript(
              {
                sourceId: "generated_asr",
                segments: asr.segments,
                text: asr.segments.map((segment) => segment.text).join(" "),
              },
              {
                audioUrl: raw.audio.url,
                title: raw.title,
                description: raw.description,
                durationSeconds: raw.audio.durationSeconds,
              },
            );
            report.verificationConfidence = detail.confidence;
            report.reasons.push("Transcript failed verification");
            for (const check of detail.checks) {
              if (check.status !== "pass") report.reasons.push(`  ${check.id}: ${check.detail}`);
            }
            continue;
          }
          report.transcriptVerified = true;

          // ---------- Adapt ----------
          const draft = getAdapter("podcast")!(raw, { transcript: segments });

          // ---------- Description ----------
          // Exactly what the pipeline does: publisher copy if the feed
          // carried any, otherwise one written from this episode's own
          // verified transcript, recorded as generated.
          //
          // The summary is REAL when VOA_ASR_ENRICH=1 (one Gemini call
          // per episode); otherwise it is a labelled stand-in, so the
          // default run still costs nothing. Either way the resolution
          // logic under test is the production one.
          const body = segments.map((segment) => segment.text).join(" ");
          const summary = ENRICH
            ? (await generateEnrichment(raw.title, body, "audio")).summary
            : `STUB SUMMARY (set VOA_ASR_ENRICH=1 for a real one): ${raw.title} - an episode of ${programme} from VOA Learning English.`;
          const resolved = resolveDescription(draft.description, summary, body.trim().length);
          report.descriptionProvenance = resolved.provenance ?? "none";
          report.description = resolved.description;

          const gated = runQualityGate({
            ...draft,
            description: resolved.description,
            descriptionProvenance: resolved.provenance,
            // What generateEnrichment() would fill. Stubbed so no Gemini
            // call is made; every check that is the PROVIDER's or ASR's
            // responsibility still runs for real.
            cefrLevelMin: "B1",
            cefrLevelMax: "B2",
            topics: ["Science"],
            estimatedTimeMinutes: Math.max(1, Math.round((raw.audio.durationSeconds ?? 0) / 60)),
          });
          if (!gated.passed) {
            report.reasons.push(...gated.reasons);
            continue;
          }
          report.gatePassed = true;
          report.outcome = "would_publish";

          expect(draft.detailsRow.transcript_provenance).toBe("generated_asr");
          expect(draft.detailsRow.licence).toBe(VOA_LICENCE);
          expect(draft.detailsRow.attribution).toBe(VOA_ATTRIBUTION);
        }
      }

      // ---------- Per-episode ----------
      for (const report of reports) {
        log(`--- [${report.programme}] ${report.title}`);
        log(`    audio:               ${report.audioUrl ?? "(none)"}`);
        log(`    stated duration:     ${report.statedDurationSeconds ?? "?"}s`);
        log(`    decoded duration:    ${report.decodedDurationSeconds ?? "?"}s`);
        log(`    ASR:                 ${report.asrCompleted ? (report.cacheHit ? "cache hit" : "transcribed") : "FAILED"}`);
        log(`    transcript words:    ${report.wordCount ?? 0}`);
        log(`    timestamp coverage:  ${pct(report.timestampCoverage)}`);
        log(`    verification:        ${report.transcriptVerified ? "accept" : `reject${report.verificationConfidence !== undefined ? ` (confidence ${report.verificationConfidence.toFixed(2)})` : ""}`}`);
        log(`    <item> elements:     ${report.itemElements?.join(", ") ?? "(none captured)"}`);
        log(`    description source:  ${report.descriptionProvenance ?? "n/a"}`);
        log(`    description:         ${report.description ? `"${report.description.slice(0, 120)}"` : "(none)"}`);
        log(`    quality gate:        ${report.gatePassed ? "pass" : "fail"}`);
        log(`    processing time:     ${report.elapsedMs !== undefined ? `${(report.elapsedMs / 1000).toFixed(1)}s` : "n/a"}${report.cacheHit ? " (cached)" : ""}`);
        log(`    outcome:             ${report.outcome}`);
        if (report.reasons.length > 0) {
          log(`    rejected because:`);
          for (const reason of report.reasons) log(`      - ${reason}`);
        }
        log();
      }

      // ---------- Totals ----------
      const wouldPublish = reports.filter((report) => report.outcome === "would_publish");
      log("================ ASR DRY RUN REPORT ================");
      log(`Fetched:              ${reports.length}`);
      log(`Audio validated:      ${reports.filter((report) => report.audioValidated).length}`);
      log(`ASR completed:        ${reports.filter((report) => report.asrCompleted).length}`);
      log(`Transcript verified:  ${reports.filter((report) => report.transcriptVerified).length}`);
      log(`Publisher description: ${reports.filter((report) => report.descriptionProvenance === "publisher").length}`);
      log(`Generated description: ${reports.filter((report) => report.descriptionProvenance === "generated").length}`);
      log(`Passed quality gate:  ${reports.filter((report) => report.gatePassed).length}`);
      log(`Would publish:        ${wouldPublish.length}`);
      log(`Rejected:             ${reports.length - wouldPublish.length}`);
      log("NOTHING WAS WRITTEN TO THE CATALOG — no database client was constructed.");

      console.log(lines.join("\n"));

      // Deliberately weak: this run exists to REPORT. The only hard
      // failures are a feed we cannot read and a feed that is not a
      // podcast feed, both asserted above.
      expect(reports.length).toBeGreaterThan(0);
    },
    60 * 60 * 1000,
  );
});

describe("VOA ASR proof harness", () => {
  it("targets programmes that were actually verified against production", () => {
    // Guards a typo'd zone id in the env from silently proving nothing.
    for (const zoneId of ZONES) {
      expect(
        VOA_PROGRAMMES.some((programme) => programme.zoneId === zoneId),
        `Zone ${zoneId} is not one of the six verified VOA programmes`,
      ).toBe(true);
    }
  });
});
