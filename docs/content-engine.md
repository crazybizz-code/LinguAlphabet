# Content Engine

Status: **architecture complete, first provider (RSS Articles) wired in.**
Companion to `docs/domain-model.md` (the universal `content_items` data
model) and `docs/content-lifecycle.md` (how content enters circulation
once it exists). This document covers the machinery in between: how a
piece of content gets from an external source into `content_items` in the
first place, for any content type, without a redesign per type.

Before this, the only ingestion path was `scripts/build-podcast-seed.mjs`
— hand-authored, template-based (no AI), hardcoded to two source files,
no dedup, no audit trail. That's still how podcasts work today and this
document doesn't change it. The Content Engine (`src/lib/content-engine/`)
is separate, forward-looking infrastructure for every source beyond
hand-authored podcasts. RSS-powered Articles (`src/lib/content-engine/providers/rss-provider.ts`,
one source today: Breaking News English) is the first proof this works
end to end — Podcasts, News, Videos, and everything else should only ever
need a new provider, never a change to the six subsystems below.

---

## The six subsystems

### 1. Content Providers

`src/lib/content-engine/types.ts`'s `ContentProvider` interface — `id`,
`contentType`, `fetchRawItems(sourceConfig): Promise<RawContentItem[]>`.
Registered via `src/lib/content-engine/providers/registry.ts`'s
`registerProvider()`/`getProvider()`. `src/lib/content-engine/providers/rss-provider.ts`'s
`rssArticleProvider` (`id: "rss"`) is the first real provider — one
implementation serves arbitrarily many RSS feeds via separate
`content_sources` rows, so a second feed is a data row, never new code.
`src/lib/content-engine/providers/bootstrap.ts` registers every real
provider at startup; `src/app/api/content-engine/ingest/route.ts` (hit
daily by Vercel Cron, `vercel.json`) is the only caller today.

A `RawContentItem` is deliberately minimal and type-agnostic: `externalId`
(the dedup key — an RSS `<guid>`, an API's item id, ...), `title`, `body`
(raw source text AI Processing enriches from), plus optional
`url`/`publishedAt`/`thumbnailUrl`. Everything provider-specific (a feed
URL, an API key reference) lives in `sourceConfig`/`content_sources.config`
jsonb — the pipeline never interprets it, only passes it through.

### 2. Content Pipeline

`src/lib/content-engine/pipeline.ts`'s `runIngestionPipeline()` — one
orchestrated flow implementing `docs/content-lifecycle.md` §1's four
stages: fetch (the provider) → stage into `content_raw_items` (dedupe by
`external_id`, skip rows already marked `processed_at`) → AI Processing →
normalize into a `ContentItemDraft` → Publishing's quality gate → Storage
write (`draft` status, or `published` if the gate passes and
`autoPublish` was requested) → a `content_ingestion_runs` row recording
what happened.

Idempotent by construction: re-running against the same source only
processes rows it hasn't already handled, so a scheduled re-run of an RSS
feed never re-ingests or re-publishes the same article twice.

### 3. AI Processing

`src/lib/content-engine/ai-processing.ts`'s `generateEnrichment(title,
body)` — the first real AI-based enrichment in the codebase (today's
podcast summary/quiz are template string-interpolation, not a model
call). One function, content-type-agnostic: title + raw body text in, the
universal enrichment attachments out (`docs/domain-model.md`'s Podcast
Model section — Vocabulary, Quiz, Reflection, and Takeaways apply to
every content type identically, not just podcasts) plus `cefrLevelMin`/
`cefrLevelMax`/`topics` — the AI-derived universal fields every content
type needs before it can pass the quality gate. `topics` is filtered
against `src/lib/constants/topics.ts`'s `CONTROLLED_TOPICS` (the same
list onboarding's Interests step collects), dropping anything Gemini
hallucinated outside it. `estimateReadingTimeMinutes(body)` sits alongside
it as a separate, deterministic word-count/200wpm function — never asked
of Gemini, which is unreliable at precise counting. Built on the existing
`generateJson()` Gemini primitive (`src/lib/gemini/client.ts`), following
`src/lib/vocabulary/lookup.ts`'s exact convention: prompt → structured
`responseSchema` → `JSON.parse` → manual runtime validation before
trusting the model's output.

### 4. Storage

`src/lib/content-engine/storage.ts`'s `upsertContentItem()` and
`upsertContentDetails(table, row)` — generic writers, neither aware of
any specific content type. `upsertContentDetails` takes the details table
name as a plain string precisely so it keeps working unmodified once
`article_details`/`video_details`/etc. exist — it doesn't need to know
about them in advance. Writes use a service-role Supabase client
(`src/lib/supabase/service-client.ts`) since an ingestion run has no
logged-in user session to write under.

### 5. Publishing

`src/lib/content-engine/publishing.ts`'s `runQualityGate(draft)` —
`docs/content-lifecycle.md` §1 stage 3's "a piece of content is not
eligible for recommendation or Explore listing until its required
metadata is complete" as actual enforced code, not a manual check.
Universal required-field checks apply to every content type; a
per-type-overrides map (empty today) mirrors
`src/lib/content/search/extract.ts`'s switch-with-default pattern for the
same reason — a future type's extra requirement slots in the same way a
future search case does. `publishContentItem()` is a plain state
transition (draft → published) — it never re-checks the gate itself, the
caller is responsible for having run it first.

**Explore's chip flip from Coming Soon to live stays a separate,
deliberate manual step** (`docs/dashboard-architecture.md` §10) — the
quality gate governs one content item at a time, not "is this whole
content type ready to launch."

### 6. Search Indexing

No new code. `src/lib/content/search/extract.ts`'s `getSearchableFields()`
already has a safe `default` case for any content type without a
dedicated one — new content flowing through the pipeline is searchable on
universal fields (title, description, topics, tags) from day one, even
before it has its own case.

---

## How RSS Articles proved the architecture (done)

1. `rssArticleProvider` (`src/lib/content-engine/providers/rss-provider.ts`)
   implements `ContentProvider` — `fetchRawItems()` parses a feed URL from
   `sourceConfig.feedUrl` via `rss-parser`, and a pure `mapFeedItemToRaw()`
   normalizes any RSS 2.0 `<item>` into a `RawContentItem`, `raw` attached
   for full metadata preservation. Registered once via
   `providers/bootstrap.ts`.
2. `article_details` (`supabase/article-content-schema.sql`) follows
   `podcast_details`'s exact 1:1-with-`content_items` pattern —
   `body`, `source_url`, `reading_time_minutes`, plus the same universal
   enrichment columns (`summary`/`takeaways`/`vocabulary`/`quiz`/
   `reflection`). Mirrored in `src/types/supabase.ts`.
3. `getSearchableFields()` (`src/lib/content/search/extract.ts`) has a
   `case "article":` covering body text plus the universal fields.
4. No `article`-specific quality-gate override was needed — the universal
   checks (title, description, CEFR range, topics/goal-alignment,
   estimated time) already cover what an article needs.
5. One `content_sources` row (seeded in `article-content-schema.sql`,
   `provider_id: "rss"`, Breaking News English's feed URL) is read by
   `src/app/api/content-engine/ingest/route.ts`, which Vercel Cron hits
   daily (`vercel.json`) and which calls `runIngestionPipeline()` per
   enabled source.

`pipeline.ts`, `storage.ts`, and `publishing.ts`'s universal checks were
untouched by adding this provider (`ai-processing.ts` gained the
CEFR/topics/reading-time fields described above, but that's shared
infra every content type benefits from, not an RSS-specific change) —
exactly the "additive, never a redesign" property
`docs/dashboard-architecture.md` §10 already commits to for the rest of
the content system. The next content type (Podcasts' real ingestion,
News, Videos, ...) should only ever need a new provider.
