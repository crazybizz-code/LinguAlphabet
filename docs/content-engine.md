# Content Engine

Status: **architecture complete, no provider wired in yet.** Companion to
`docs/domain-model.md` (the universal `content_items` data model) and
`docs/content-lifecycle.md` (how content enters circulation once it
exists). This document covers the machinery in between: how a piece of
content gets from an external source into `content_items` in the first
place, for any content type, without a redesign per type.

Before this, the only ingestion path was `scripts/build-podcast-seed.mjs`
— hand-authored, template-based (no AI), hardcoded to two source files,
no dedup, no audit trail. That's still how podcasts work today and this
document doesn't change it. The Content Engine (`src/lib/content-engine/`)
is separate, forward-looking infrastructure for every source beyond
hand-authored podcasts, starting with RSS-powered Articles next.

---

## The six subsystems

### 1. Content Providers

`src/lib/content-engine/types.ts`'s `ContentProvider` interface — `id`,
`contentType`, `fetchRawItems(sourceConfig): Promise<RawContentItem[]>`.
Registered via `src/lib/content-engine/providers/registry.ts`'s
`registerProvider()`/`getProvider()`. Empty registry today — nothing
calls `registerProvider()` yet, which is the correct state until a real
provider exists.

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
every content type identically, not just podcasts). Built on the existing
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

## How the RSS Articles task plugs in

1. Implement `ContentProvider` for RSS (parses a feed URL from
   `sourceConfig` into `RawContentItem[]`) and call `registerProvider()`
   once, at startup.
2. Add `article_details` to `supabase/content-schema.sql`-style migration
   (same 1:1-with-`content_items` pattern `podcast_details` already
   follows) and to `src/types/supabase.ts`.
3. Add one `case "article":` to `getSearchableFields()`
   (`src/lib/content/search/extract.ts`) for article-specific fields
   (body text) beyond the universal ones it already gets for free.
4. Optionally add an `article` entry to `publishing.ts`'s
   `TYPE_SPECIFIC_CHECKS` if articles need an extra required field beyond
   the universal ones (e.g. a minimum body length).
5. Insert a `content_sources` row with the feed URL, then call
   `runIngestionPipeline()` — nothing else in the engine changes.

Nothing above touches `pipeline.ts`, `storage.ts`, `publishing.ts`'s
universal checks, or `ai-processing.ts` — exactly the "additive, never a
redesign" property `docs/dashboard-architecture.md` §10 already commits
to for the rest of the content system.
