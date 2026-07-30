# Closed Beta Readiness

Operational runbook for taking LinguABC into Closed Beta. Written at the
close of the Emergency Launch Sprint (podcast intake, multi-source
content, thumbnail pipeline).

**Read this first:** every "verified" claim below states *where* it was
verified. The sprint ran in a sandbox with **no outbound network access
to any content host** (the gateway 403s api.plos.org, theconversation.com,
nasa.gov, and every feed domain) and **no live Supabase or
GEMINI_API_KEY**. So logic, types, builds, and rendering are verified;
**anything requiring a real feed, a real Gemini response, or a real
database write is not, and is listed under [Must verify on staging](#must-verify-on-staging).**
Do not treat this document as a green light on its own.

---

## 1. Deploy sequence

### 1.1 Database migrations

Run in this order. Both are additive and idempotent; neither destroys data.

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/enrichment-expansion-schema.sql` | Adds Key Expressions / Discussion Questions to both `*_details` tables; Listening Notes to `podcast_details`; Grammar Notes + reading difficulty to `article_details`; transcript provenance columns. |
| 2 | `supabase/content-source-restore-multi-source.sql` | Re-enables every RSS source with a real feed URL, re-enables PLOS, and sizes per-source item caps to the run's time budget. |

> `supabase/demo-prep-clean-and-reingest.sql` and
> `content-engine-reset-single-source.sql` are **destructive historical
> migrations**. They are already applied. Do not re-run them — the first
> deletes every published article, the second deletes every RSS source.

### 1.2 Required environment variables

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | Content engine writes only. Never in a Client Component. |
| `GEMINI_API_KEY` | **secret** | No `NEXT_PUBLIC_` prefix. **Ingestion silently produces nothing without it** — this was the one blocker that stopped end-to-end podcast verification in the sandbox. |
| `CRON_SECRET` | **secret** | Gates `/api/content-engine/ingest`, `/api/content-engine/podcasts`, and the push cron. **If unset, all three are publicly callable** — the code deliberately skips the auth check rather than failing closed, so an unset value in production is an open endpoint, not a broken one. Set it. |
| `NEXT_PUBLIC_SITE_URL` | public | Auth redirects, OG tags. |
| `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | mixed | Web Push. Push degrades cleanly if absent. |
| `ADMIN_EMAILS` | secret | Comma-separated admin allowlist. |

### 1.3 Scheduled jobs (`vercel.json`)

| Schedule (UTC) | Path | Purpose |
|---|---|---|
| `0 6 * * *` | `/api/content-engine/ingest` | Daily article ingestion across all enabled sources. |
| `0 18 * * *` | `/api/push/send-streak-reminders` | Streak-at-risk push. |

---

## 2. Must verify on staging

**None of these can be checked from the build environment.** Each is a
genuine unknown, not a formality. Ordered by what breaks the beta worst.

### 2.1 Multi-source ingestion actually publishes — *highest risk*

Trigger one run:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://<staging-host>/api/content-engine/ingest | jq '.summary, .runs'
```

The response now reports this directly:

```jsonc
"summary": {
  "sourcesEnabled": 15,
  "sourcesSucceeded": 13,
  "sourcesFailed": 2,
  "sourcesPublishingContent": 9,
  "singleSourceRisk": false      // ← must be false
}
```

- `singleSourceRisk: true` means **the launch blocker is not actually
  fixed** — only one source is producing content, whatever the enabled
  count says.
- Expect *some* failures. ~10 of the enabled feed URLs were never fetched
  by anyone; they came from prior migrations and are plausible but
  unconfirmed. A dead URL now fails that source alone and reports its
  reason, instead of taking the run down.
- Prune whatever fails twice: `update content_sources set enabled = false
  where name = '<name>';`

**Watch the clock.** The run budget assumes ~8s/item and ~18 items
(~150s) against a 300s ceiling. If a run approaches the ceiling, lower
`maxItemsPerRun`. Sources are processed in query order, so a run that
*does* exhaust its budget starves the same trailing sources every day —
that fairness gap is unaddressed by design (it would be new scheduling
work); the caps are sized to avoid reaching it.

### 2.2 Thumbnails resolve to real images

```sql
select cs.name,
       count(*) as articles,
       count(*) filter (where ci.thumbnail_url <> '') as with_image
from content_items ci
join content_raw_items cri on cri.content_item_id = ci.id
join content_sources cs on cs.id = cri.source_id
where ci.content_type = 'article'
group by cs.name order by articles desc;
```

Thumbnails are now HEAD-validated at ingestion, so `thumbnail_url` is
either a URL that really served an image or empty. A source at 0/N means
its feed carries no images (fine — branded cover) **or** the extractor
misses its markup shape (worth a look). The PLOS `og:image` path is the
least certain part of this change: the journal-code→site URL mapping was
derived from the DOI format but never fetched. If PLOS shows 0/N, that
mapping is the first thing to check — it degrades to the branded cover
rather than breaking, so it is not a launch blocker.

Then confirm visually on `/explore` that no card shows a broken-image
icon at desktop, tablet, and mobile widths.

### 2.3 One real podcast, end to end

The transcript verifier is fully unit-tested and its rejection path was
exercised live. **The accept path has never reached a real Gemini call or
a real database write** — it was confirmed to pass verification and stop
exactly at the missing API key.

```bash
CRON_SECRET=... node scripts/ingest-podcast.mjs \
  --title "<real episode title>" \
  --audio "<real audio URL>" \
  --duration <seconds> \
  --transcript ./transcript.txt \
  --description "<show notes>" \
  --draft
```

`--draft` stages it as `draft` so the AI output can be reviewed before
learners see it. Verify: the verification report prints, the episode
appears with Summary / Vocabulary / Key Expressions / Discussion
Questions / Quiz / CEFR / Listening Notes populated, and the audio plays
against the transcript in the Learning Session.

**Also submit one deliberately wrong transcript** (e.g. a different
episode's file) and confirm it is rejected with a specific reason. The
gate is the whole point of the workflow; verify it fires in production,
not just in tests.

### 2.4 Gemini enrichment quality

Read the actual output of the first few enriched articles. The prompt
gained four new fields this sprint and **no real model response has ever
been inspected.** Specifically check that Key Expressions are genuinely
multi-word (not single words duplicating `vocabulary`) and that Grammar
Notes name structures actually present in the text.

---

## 3. What Closed Beta ships with

### Working
- Email auth (no OAuth, by design), full onboarding wizard
- Dashboard, Explore, Learning Sessions (article + podcast), Review,
  Progress, Insights, Profile, Settings
- Tuto AI Coach
- Vocabulary spaced repetition; streaks with shield + at-risk nudges;
  Web Push; weekly recap
- Daily multi-source article ingestion with AI enrichment
- Human-in-the-loop podcast intake with transcript verification

### Deliberately not in scope
- **Knowledge Hub beyond Podcasts** — Articles, Videos, News, Stories,
  Conversations, Challenges are "Coming Soon" placeholders. They make no
  promises (the false "Notify Me" was removed earlier in the sprint).
- **Learning Brain recommendation engine** — not built. Content surfaces
  without automated curation; there is deliberately no browse-and-choose
  lesson picker.
- **Android** — `android/` and `capacitor.config.json` are dormant.
- **Automatic transcription** — podcasts are operator-supplied by design.
  The `TranscriptSource` seam means dropping in Whisper later needs no
  change to verification or AI processing.

---

## 4. Known risks

| Risk | Severity | Position |
|---|---|---|
| ~10 enabled feed URLs unverified | **High** | Isolated per-source; a dead feed fails alone and reports why. Prune after the first staging run. |
| Gemini quality on 4 new fields unreviewed | **Medium** | Cosmetic, not structural — bad output degrades the lesson, it doesn't break it. Review during 2.4. |
| `/_next/image` is an open resizing proxy | **Medium** | Deliberate. `next.config.ts` now allows any https host, because a hand-maintained allowlist silently hid real photos from every new source. Narrow to observed CDN hosts once the source set stabilises. |
| PLOS `og:image` URL pattern unverified | **Low** | Degrades to the branded cover. Cosmetic only. |
| Trailing sources starved if a run times out | **Low** | Caps sized to avoid it; monitor via `summary`. |
| The Conversation remains the quality anchor | **Low** | Its `/share/` endpoint is still a single dependency for the *best* content, though no longer for *all* content — which was the actual blocker. |

---

## 5. First-week monitoring

```sql
-- Ingestion health. More than one source should publish daily.
select cs.name, cir.status, cir.items_fetched, cir.items_published, cir.error
from content_ingestion_runs cir
join content_sources cs on cs.id = cir.source_id
where cir.started_at > now() - interval '2 days'
order by cir.started_at desc;

-- Where items die. A spike in one status is the signal.
select status, count(*), max(stage_updated_at)
from content_raw_items
where stage_updated_at > now() - interval '2 days'
group by status order by count(*) desc;
```

Alert if: `sourcesPublishingContent` drops to ≤1 on consecutive days; no
`content_items` published in 48h; `QUALITY_GATE_FAILED` or `FAILED`
becomes the dominant status.
