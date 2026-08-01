-- ============================================================
-- Podcast provenance + content-identity dedup.
--
-- Two problems, one migration.
--
-- PROVENANCE. article_details has carried `source_url` since it existed,
-- with the comment "RSS content isn't ours to host without linking back".
-- podcast_details never got the equivalent, so nothing recorded where an
-- episode came from, under what licence we were serving it, or who we
-- were required to credit. That was survivable at 13 hand-placed episodes
-- and is not survivable at 60 automated ones — and adding these columns
-- after the fact means backfilling 60 unknowns instead of writing them
-- once at ingest.
--
-- DEDUP. `podcastContentId()` hashes the audio URL, which makes
-- re-submitting the same URL idempotent and does nothing about the case
-- that actually happens: the same episode under a second URL (CDN change,
-- ?utm_source= suffix, publisher re-host). transcript_hash identifies the
-- episode by what it SAYS, which is the thing that doesn't change when a
-- URL does — the audio equivalent of content_raw_items.content_hash.
--
-- All columns are NULLABLE with no backfill. Existing rows genuinely do
-- not have this information, and inventing a licence for content whose
-- licence is the open question would be worse than leaving it null.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================

alter table public.podcast_details add column if not exists source_url text;
alter table public.podcast_details add column if not exists licence text;
alter table public.podcast_details add column if not exists attribution text;
alter table public.podcast_details add column if not exists transcript_provenance text;
alter table public.podcast_details add column if not exists transcript_hash text;

comment on column public.podcast_details.source_url is
  'The episode page on the publisher''s own site. Attribution target and the human-checkable record of where this came from. Parity with article_details.source_url.';

comment on column public.podcast_details.licence is
  'Licence we are serving this under: public-domain | ogl-v3 | cc-by-4.0 | licensed | permission-pending. Free text rather than an enum — the licence vocabulary is policy (docs/content-source-policy.md), not schema, and a new licence must not require a migration.';

comment on column public.podcast_details.attribution is
  'The exact credit line the licence requires, captured at ingest. Stored rather than derived so a later change to a source''s attribution text cannot silently rewrite what we displayed for already-published episodes.';

comment on column public.podcast_details.transcript_provenance is
  'publisher | publisher_episode_page | operator | asr. Load-bearing for trust, not display: a publisher-supplied transcript deserves a different verification bar than an operator-typed one, and when ASR lands you need to know which episodes were machine-transcribed without re-deriving it. publisher_episode_page is the publisher''s own text taken from the episode page rather than the feed — same authority, more fragile extraction, so it is tracked separately.';

comment on column public.podcast_details.transcript_hash is
  'SHA-256 of the normalized transcript text (speaker labels, casing, punctuation and whitespace stripped). Identifies the episode by content so the same episode cannot publish twice under two audio URLs. Null when there is no transcript — the quality gate rejects those, and a hash of nothing would collide every empty episode with every other.';

-- Drives the duplicate lookup at ingest: "is there already an episode
-- with this transcript, under a different id?". Partial because null
-- hashes are exactly the rows that must never match each other.
create index if not exists podcast_details_transcript_hash_idx
  on public.podcast_details (transcript_hash)
  where transcript_hash is not null;

-- ===================== VERIFY =====================
--   select ci.title, pd.licence, pd.transcript_provenance,
--          left(pd.transcript_hash, 12) as hash, pd.source_url
--   from public.podcast_details pd
--   join public.content_items ci on ci.id = pd.content_item_id
--   order by ci.published_at desc limit 20;
--
-- Duplicates by content rather than by URL:
--   select transcript_hash, count(*)
--   from public.podcast_details
--   where transcript_hash is not null
--   group by 1 having count(*) > 1;
