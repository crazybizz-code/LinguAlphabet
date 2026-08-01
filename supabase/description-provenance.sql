-- Records who wrote a content item's description.
--
-- WHY. VOA's podcast feeds publish no blurb anywhere a feed can carry
-- one -- not <description>, not <itunes:summary>, not <itunes:subtitle>.
-- The quality gate correctly refuses to publish a card with no
-- description, so for those episodes the description is written from the
-- episode's own verified transcript during enrichment.
--
-- That is legitimate -- it describes the episode from the episode -- but
-- it is OUR sentence, not VOA's, and on a rendered card the two are
-- indistinguishable. This column keeps them distinguishable in the one
-- place it still can be: the row.
--
-- Safe to run more than once. Adds one nullable column, backfills
-- nothing, and changes no existing value.

alter table public.content_items add column if not exists description_provenance text;

comment on column public.content_items.description_provenance is
  'publisher | generated. Who wrote description. "publisher" is the source''s own copy, taken verbatim from the feed. "generated" was written from the item''s own verified body/transcript during AI enrichment, because the source published none -- it must never be presented as the publisher''s words. NULL means the row predates this column and its origin was not recorded; it is deliberately not defaulted to "publisher", because claiming authorship we never verified is exactly what this column exists to prevent.';

-- Which sources are actually relying on generated descriptions:
--
--   select ci.content_type,
--          coalesce(ci.description_provenance, 'unrecorded') as provenance,
--          count(*)
--   from public.content_items ci
--   group by 1, 2
--   order by 1, 2;
--
-- Reversal, if this is ever unwanted:
--
--   alter table public.content_items drop column if exists description_provenance;
