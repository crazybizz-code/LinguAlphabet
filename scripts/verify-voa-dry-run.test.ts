import { describe, it, expect } from "vitest";
import { parseVoaFeed, VOA_ATTRIBUTION, VOA_LICENCE } from "@/lib/content-engine/providers/voa-provider";
import { resolveTranscript } from "@/lib/content-engine/transcripts/resolve";
import { verifyTranscript } from "@/lib/content-engine/transcripts/verify";
import { getAdapter } from "@/lib/content-engine/adapters/registry";
import { runQualityGate } from "@/lib/content-engine/publishing";
import { isReachableAudio } from "@/lib/content-engine/audio";
import { computeTranscriptHash } from "@/lib/content-engine/transcripts/hash";

/**
 * OPERATOR DRY RUN — verifies the VOA provider against the REAL feed.
 *
 * Opt-in: skipped entirely unless VOA_FEED_URL is set, so `npm test` and
 * CI never touch the network.
 *
 *   VOA_FEED_URL="https://…/rss.xml" npx vitest run scripts/verify-voa-dry-run.test.ts
 *
 * WRITES NOTHING. No Supabase client is constructed, no content_items or
 * podcast_details row is touched, and no Gemini call is made — the
 * post-enrichment fields the quality gate needs (CEFR, topics, estimated
 * time) are stubbed and labelled as such in the output. This proves
 * everything the provider and pipeline own; it deliberately does not
 * prove what the enrichment model would return.
 *
 * The point is to find out whether the LIVE feed matches the fixture the
 * provider was built against. If it doesn't, the run reports exactly
 * which field is wrong, and the fix is: correct the provider, then paste
 * the real <item> XML into voa-provider.test.ts as a regression fixture.
 */

const FEED_URL = process.env.VOA_FEED_URL;
const MAX_EPISODES = Number(process.env.VOA_MAX_EPISODES ?? 3);

interface EpisodeReport {
  title: string;
  outcome: "would_publish" | "rejected";
  rejectionReasons: string[];
  audioUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  sourceUrl?: string;
  transcriptSegments?: number;
  transcriptWords?: number;
  transcriptConfidence?: number;
  audioContentType?: string | null;
  licence?: string;
  attribution?: string;
  transcriptHash?: string | null;
}

describe.skipIf(!FEED_URL)("VOA live dry run", () => {
  it(
    "fetches, resolves, validates and gates real episodes without publishing",
    async () => {
      const lines: string[] = [];
      const log = (line = "") => lines.push(line);

      // ---------- 1. Feed reachable ----------
      const response = await fetch(FEED_URL!, {
        headers: { accept: "application/rss+xml, application/xml, text/xml" },
      });
      log(`FEED  ${FEED_URL}`);
      log(`      HTTP ${response.status} ${response.headers.get("content-type") ?? "(no content-type)"}`);
      expect(response.ok, `Feed returned HTTP ${response.status}`).toBe(true);

      const xml = await response.text();
      log(`      ${xml.length} bytes`);

      // ---------- 2. Parses ----------
      const rawItemCount = (xml.match(/<item\b/gi) ?? []).length;
      const items = parseVoaFeed(xml).slice(0, MAX_EPISODES);
      log(`      <item> elements in feed: ${rawItemCount}`);
      log(`      parsed as episodes:      ${items.length > 0 ? items.length : 0}${items.length === 0 ? "  <-- provider matched nothing; see NOTES" : ""}`);
      log();

      const reports: EpisodeReport[] = [];

      for (const raw of items) {
        const report: EpisodeReport = { title: raw.title, outcome: "rejected", rejectionReasons: [] };
        reports.push(report);

        report.audioUrl = raw.audio?.url;
        report.durationSeconds = raw.audio?.durationSeconds;
        report.publishedAt = raw.publishedAt;
        report.sourceUrl = raw.url;
        report.licence = raw.licence;
        report.attribution = raw.attribution;

        // ---------- 3. Audio reachable ----------
        if (!raw.audio?.url) {
          report.rejectionReasons.push("No <enclosure> audio URL");
          continue;
        }
        const probe = await isReachableAudio(raw.audio.url);
        report.audioContentType = probe.contentType;
        if (!probe.ok) {
          report.rejectionReasons.push(probe.reason ?? "Audio unreachable");
          continue;
        }

        // ---------- 4. Transcript resolution + verification ----------
        if (!raw.transcriptRef) {
          report.rejectionReasons.push("Feed carried no transcript/script for this episode");
          continue;
        }
        const segments = await resolveTranscript(raw);
        if (!segments) {
          // Re-run verification just to report WHICH check failed, rather
          // than only that resolution returned null.
          report.rejectionReasons.push("Transcript failed verification (see per-check detail below)");
          const text = raw.transcriptRef.kind === "inline" ? raw.transcriptRef.text : "";
          if (text) {
            const detail = verifyTranscript(
              { sourceId: "publisher", segments: [{ speaker: "Speaker", text, startMs: 0, endMs: 0 }], text },
              { audioUrl: raw.audio.url, title: raw.title, description: raw.description, durationSeconds: raw.audio.durationSeconds },
            );
            for (const check of detail.checks) {
              if (check.status !== "pass") report.rejectionReasons.push(`  ${check.id}: ${check.detail}`);
            }
          }
          continue;
        }
        report.transcriptSegments = segments.length;
        report.transcriptWords = segments.map((s) => s.text).join(" ").split(/\s+/).filter(Boolean).length;
        report.transcriptHash = computeTranscriptHash(segments);

        // ---------- 5. Adapt ----------
        const adapter = getAdapter("podcast")!;
        const draft = adapter(raw, { transcript: segments });

        // ---------- 6. Quality gate ----------
        // CEFR/topics/estimatedTimeMinutes are what generateEnrichment()
        // would fill. Stubbed so no Gemini call is made — every check that
        // is actually the PROVIDER's responsibility still runs for real.
        const gated = runQualityGate({
          ...draft,
          cefrLevelMin: "B1",
          cefrLevelMax: "B2",
          topics: ["Science"],
          estimatedTimeMinutes: Math.max(1, Math.round((raw.audio.durationSeconds ?? 0) / 60)),
        });

        if (!gated.passed) {
          report.rejectionReasons.push(...gated.reasons);
          continue;
        }
        report.outcome = "would_publish";
      }

      // ---------- Report ----------
      const wouldPublish = reports.filter((r) => r.outcome === "would_publish");
      const rejected = reports.filter((r) => r.outcome === "rejected");

      log("================ DRY RUN REPORT ================");
      log(`Fetched:              ${items.length}`);
      log(`Resolved transcript:  ${reports.filter((r) => r.transcriptSegments).length}`);
      log(`Passed validation:    ${reports.filter((r) => r.audioContentType !== undefined && r.transcriptSegments).length}`);
      log(`Passed quality gate:  ${wouldPublish.length}`);
      log(`Would publish:        ${wouldPublish.length}`);
      log(`Rejected:             ${rejected.length}`);
      log("NOTHING WAS WRITTEN — no database client was constructed.");
      log();

      for (const report of reports) {
        log(`--- ${report.title}`);
        log(`    outcome:        ${report.outcome}`);
        log(`    audio:          ${report.audioUrl ?? "(none)"}`);
        log(`    audio type:     ${report.audioContentType ?? "(not probed)"}`);
        log(`    duration:       ${report.durationSeconds ?? "(none)"}s`);
        log(`    published:      ${report.publishedAt ?? "(none)"}`);
        log(`    source_url:     ${report.sourceUrl ?? "(none)"}`);
        log(`    licence:        ${report.licence ?? "(none)"}`);
        log(`    attribution:    ${report.attribution ?? "(none)"}`);
        log(`    transcript:     ${report.transcriptSegments ?? 0} segments / ${report.transcriptWords ?? 0} words`);
        log(`    transcript_hash:${report.transcriptHash ? ` ${report.transcriptHash.slice(0, 16)}…` : " (none)"}`);
        if (report.rejectionReasons.length > 0) {
          log(`    rejected because:`);
          for (const reason of report.rejectionReasons) log(`      - ${reason}`);
        }
        log();
      }

      if (items.length === 0) {
        log("NOTES");
        log("  The provider parsed zero episodes from a feed that has items.");
        log("  Most likely one of: the enclosure is not type=audio/*, the");
        log("  duration tag differs from <itunes:duration>, or the script is");
        log("  not in <content:encoded>. Paste one real <item> block into");
        log("  src/lib/content-engine/providers/__tests__/voa-provider.test.ts");
        log("  as a regression fixture, then fix the parser against it.");
      }

      console.log(lines.join("\n"));

      // Assertions are deliberately weak: this run exists to REPORT, not
      // to gate CI. The only hard failure is a feed we cannot read at all,
      // asserted above.
      expect(reports.every((r) => r.licence === VOA_LICENCE || r.outcome === "rejected")).toBe(true);
      expect(reports.every((r) => r.attribution === VOA_ATTRIBUTION || r.outcome === "rejected")).toBe(true);
    },
    120_000,
  );
});
