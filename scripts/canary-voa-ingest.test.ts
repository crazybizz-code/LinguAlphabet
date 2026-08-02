import { describe, it, expect } from "vitest";
import "@/lib/content-engine/providers/bootstrap";
import { contentEngine } from "@/lib/content-engine";
import { requireAdapter } from "@/lib/content-engine/adapters/registry";
import { resolveTranscript } from "@/lib/content-engine/transcripts/resolve";
import { createWhisperTranscriber } from "@/lib/content-engine/transcripts/asr";
import { createServiceClient } from "@/lib/supabase/service-client";
import { checkProviderConfiguration } from "@/ai/providers";

/**
 * PRODUCTION CANARY — one real episode, into the real database, as a DRAFT.
 *
 * Opt-in: skipped unless VOA_CANARY=1. This is the only script in the
 * repo that writes to the production catalogue, so it is deliberately
 * awkward to trigger by accident.
 *
 *   VOA_CANARY=1 VOA_CANARY_SOURCE_ID=<uuid> \
 *     npx vitest run scripts/canary-voa-ingest.test.ts
 *
 * WHY THIS EXISTS AT ALL. The scheduled route
 * (/api/content-engine/ingest) passes `resolveTranscript` WITHOUT a
 * transcriber, so a VOA episode's `{ kind: "asr" }` reference resolves to
 * null and the episode is dropped. That is correct fail-closed behaviour
 * — Vercel has no Python and no ffmpeg, so it genuinely cannot transcribe
 * — but it means there is no automated path that can ingest VOA today.
 * This script is that path, run by an operator, on a machine that has the
 * ASR toolchain.
 *
 * IT IS THE REAL PIPELINE. Not a re-implementation: the same
 * runIngestionPipeline the cron calls, the same adapter registry, the
 * same transcript resolution, verification, enrichment, quality gate,
 * dedup and storage. The ONLY differences from the scheduled run are the
 * two that matter here:
 *
 *   1. a real transcriber is supplied, so ASR can actually happen;
 *   2. autoPublish is omitted, so a passing item is written as `draft`.
 *
 * DRAFT MEANS INVISIBLE. content_items RLS exposes only
 * status in ('published', 'coming_soon') to authenticated learners, so a
 * draft row cannot reach anybody until a human publishes it. Publishing
 * is a separate, deliberate act — not something this script can do.
 *
 * Nothing here weakens the gate, the verifier or the provenance
 * requirements. An episode that fails any of them is rejected and simply
 * does not appear.
 */

const ENABLED = process.env.VOA_CANARY === "1";
const SOURCE_ID = process.env.VOA_CANARY_SOURCE_ID ?? "";
const MODEL = process.env.VOA_ASR_MODEL ?? "medium.en";
const TIMEOUT_MINUTES = Number(process.env.VOA_CANARY_TIMEOUT_MINUTES ?? 45);

describe.skipIf(!ENABLED)("VOA production canary", () => {
  it(
    "ingests exactly one episode as a draft through the real pipeline",
    async () => {
      expect(SOURCE_ID, "VOA_CANARY_SOURCE_ID must be the content_sources.id of the seeded VOA row").not.toBe("");

      const configuration = checkProviderConfiguration();
      expect(
        configuration.ok,
        `The "${configuration.providerId}" AI provider is not configured. Missing: ${configuration.missing.join(", ")}`,
      ).toBe(true);

      const supabase = createServiceClient();

      // Read the source EXACTLY as the scheduled route does, rather than
      // constructing config here — a canary that runs against different
      // configuration from production proves nothing about production.
      const { data: source, error } = await supabase
        .from("content_sources")
        .select("*")
        .eq("id", SOURCE_ID)
        .single();

      expect(error, `Could not read content_sources row ${SOURCE_ID}: ${error?.message}`).toBeNull();
      expect(source, "No content_sources row with that id").toBeTruthy();

      const config = (source!.config ?? {}) as Record<string, unknown>;
      console.log(`SOURCE   ${source!.name}`);
      console.log(`         provider=${source!.provider_id}  enabled=${source!.enabled}`);
      console.log(`         feedUrl=${String(config.feedUrl)}`);
      console.log(`         maxItemsPerRun=${String(config.maxItemsPerRun)}`);
      console.log(`ASR      ${MODEL} (local, cached in .asr-cache)`);
      console.log(`PUBLISH  autoPublish OFF - a passing item is written as draft`);
      console.log("");

      // The source does NOT need to be enabled for this. `enabled` gates
      // the scheduled route's source selection; the canary addresses one
      // source by id on purpose, so a programme can be proven in
      // production while still being switched off for automation.
      const provider = contentEngine.getProvider(source!.provider_id);
      expect(provider, `Provider '${source!.provider_id}' is not registered`).toBeTruthy();

      const adapter = requireAdapter(provider!.contentType);
      const transcribe = createWhisperTranscriber({ model: MODEL });

      const result = await contentEngine.runIngestionPipeline(supabase, provider!, {
        sourceId: source!.id,
        sourceConfig: config,
        // Omitted deliberately. `autoPublish: true` is what the cron
        // passes; leaving it unset writes a passing item as `draft`,
        // which RLS keeps away from every learner until a human decides.
        // autoPublish: false,
        normalize: (raw, context) => adapter(raw, context),
        // THE line the scheduled route cannot supply. Everything else on
        // this call is identical to production.
        resolveTranscript: (raw) => resolveTranscript(raw, { transcribe }),
      });

      console.log("");
      console.log("================ CANARY RESULT ================");
      console.log(`run id:      ${result.runId}`);
      console.log(`fetched:     ${result.itemsFetched}`);
      console.log(`retried:     ${result.itemsRetried}`);
      console.log(`published:   ${result.itemsPublished}   (as DRAFT — autoPublish is off)`);
      console.log(`rejected:    ${result.itemsRejected}`);
      console.log(`status:      ${result.status}`);
      if (result.error) console.log(`error:       ${result.error}`);
      console.log("");
      console.log("Nothing is visible to learners. Inspect the row, then publish by hand.");

      // Deliberately weak, like the dry runs: this exists to REPORT. A
      // rejected episode is a real, informative outcome — the quality
      // gate doing its job is not a test failure — so only an outright
      // pipeline failure fails here.
      expect(result.status).toBe("completed");
    },
    TIMEOUT_MINUTES * 60 * 1000,
  );
});
