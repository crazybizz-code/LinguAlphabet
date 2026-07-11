-- ============================================================
-- Article content type — first real Content Engine provider
-- (docs/content-engine.md). Additive migration, run after
-- supabase/content-schema.sql and supabase/content-engine-schema.sql.
-- Follows podcast_details' exact pattern: content_items stays universal,
-- article_details is the 1:1 type-specific extension.
-- ============================================================

-- ===================== ARTICLE DETAILS =====================
-- 1:1 extension of content_items where content_type = 'article'.
create table if not exists public.article_details (
  content_item_id text primary key references public.content_items(id) on delete cascade,
  -- The article's full text — the core asset, parallel to podcast_details.audio_url.
  body text not null,
  -- Attribution back to the source — RSS content isn't ours to host without linking back.
  source_url text,
  -- Type-specific twin of content_items.estimated_time_minutes (docs/dashboard-architecture.md,
  -- docs/content-lifecycle.md) — not a duplicate, same relationship
  -- podcast_details.duration_seconds has to the universal estimated_time_minutes.
  reading_time_minutes numeric not null,
  -- Universal enrichment attachments (docs/domain-model.md's Podcast Model
  -- section) — identical shape to podcast_details, every content type reuses it.
  summary text,
  takeaways jsonb not null default '[]',
  vocabulary jsonb not null default '[]',
  quiz jsonb not null default '[]',
  reflection text
);

alter table public.article_details enable row level security;

drop policy if exists "Article details are readable by authenticated users" on public.article_details;
create policy "Article details are readable by authenticated users"
  on public.article_details for select
  to authenticated
  using (
    exists (
      select 1 from public.content_items c
      where c.id = article_details.content_item_id
        and c.status in ('published', 'coming_soon')
    )
  );

-- ===================== SEED SOURCE =====================
-- The one RSS source for this first end-to-end proof (docs/content-engine.md)
-- — Breaking News English, a long-established ESL graded-reading news feed.
-- "Support only ONE provider... optimize for architecture, not quantity."
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'Breaking News English', '{"feedUrl": "https://breakingnewsenglish.com/bne.xml"}'::jsonb, true
where not exists (
  select 1 from public.content_sources where provider_id = 'rss' and name = 'Breaking News English'
);
