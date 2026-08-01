-- ============================================================
-- Unpublish the BBC Learning English podcast episodes.
--
-- WHY. LinguABC is a commercial IELTS platform. BBC's terms for its
-- education content require that there are no advertisements on or around
-- the content, that access is not charged for, and that no BBC
-- endorsement is implied. "Not charged for" is not a condition a paid
-- product can design around.
--
-- We are currently hotlinking audio from downloads.bbc.co.uk, storing BBC
-- transcripts, and generating vocabulary/summaries/quizzes from them —
-- all inside a commercial product, with no licence. docs/content-source-
-- policy.md already excluded BBC Learning English from automated
-- ingestion for exactly this reason; these rows predate that policy and
-- were never reconciled with it.
--
-- NOTHING IS DELETED. Rows, transcripts, enrichment and audio URLs all
-- stay exactly as they are. This only flips visibility, so the day a
-- licence is agreed the catalog comes back with one UPDATE and no
-- re-ingestion.
--
-- WHY 'draft' AND NOT 'coming_soon'. The RLS policy on content_items
-- exposes both 'published' AND 'coming_soon' to authenticated users
-- (supabase/content-schema.sql). Only 'draft' actually removes them from
-- the learner-facing catalog.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- Matched on the audio host rather than on a hardcoded id list: it is the
-- fact that makes these rows BBC content, it cannot drift, and it catches
-- any episode added since this file was written.
update public.content_items ci
set status = 'draft',
    updated_at = now()
from public.podcast_details pd
where pd.content_item_id = ci.id
  and ci.content_type = 'podcast'
  and ci.status = 'published'
  and pd.audio_url ilike '%bbc.co.uk%';

-- ===================== VERIFY =====================
--
-- Should return zero rows once applied:
--   select ci.id, ci.title, ci.status
--   from public.content_items ci
--   join public.podcast_details pd on pd.content_item_id = ci.id
--   where pd.audio_url ilike '%bbc.co.uk%' and ci.status = 'published';
--
-- Confirms nothing was lost — expect 13 drafted rows, transcripts intact:
--   select ci.status, count(*),
--          sum((jsonb_array_length(coalesce(pd.transcript, '[]'::jsonb)) > 0)::int) as with_transcript
--   from public.content_items ci
--   join public.podcast_details pd on pd.content_item_id = ci.id
--   where pd.audio_url ilike '%bbc.co.uk%'
--   group by ci.status;
--
-- ===================== REVERSAL =====================
-- If a licence is later obtained, this restores them exactly:
--   update public.content_items ci set status = 'published', updated_at = now()
--   from public.podcast_details pd
--   where pd.content_item_id = ci.id and pd.audio_url ilike '%bbc.co.uk%' and ci.status = 'draft';
