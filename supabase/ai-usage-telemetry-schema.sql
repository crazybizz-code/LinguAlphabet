-- ============================================================
-- AI usage telemetry — one row per provider request.
--
-- Closes the gap the AI architecture audit found: OpenRouter returns
-- prompt/completion token counts on every response, the provider client
-- parsed them into AIProviderUsage, and then nothing read the result.
-- Spend could not be measured, compared per feature, or verified after a
-- model change.
--
-- Written by src/ai/telemetry/supabase-sink.ts via the service-role
-- client, from src/ai/providers/openrouter/client.ts.
--
-- DELIBERATELY CARRIES NO LEARNER IDENTITY. There is no user_id column
-- and no prompt/response text. This is infrastructure cost accounting,
-- not behavioural analytics — several AI calls (the ingest cron, the
-- turn classifier) have no user session at all, and storing prompt
-- bodies here would duplicate learner content into a table with a
-- completely different retention and access profile. Per-learner
-- behaviour already has its own home in analytics_events and
-- learning_signals.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),

  -- Exact model slug that served the request (e.g. 'google/gemini-2.5-flash').
  -- Stored per row rather than inferred from config, so historical rows
  -- stay correct across a model switch — which is the whole point of
  -- being able to compare before and after.
  model text not null,

  -- Which part of the product spent this: 'chat', 'turn_classifier',
  -- 'conversation_summary', 'vocabulary_explanation', 'article_summary',
  -- 'article_discussion_questions', 'article_comprehension_questions'.
  -- 'unattributed' means a call site that did not pass one.
  feature text not null,

  -- NULLABLE ON PURPOSE. A streamed response without a usage frame
  -- reports no counts, and a failed request may report none either. NULL
  -- means "not reported"; 0 would mean "genuinely free" and would quietly
  -- corrupt any SUM built on this table.
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,

  latency_ms integer not null,

  -- Estimated, never authoritative — priced from a snapshot table in
  -- src/ai/telemetry/pricing.ts. NULL for a model with no known price,
  -- for the same reason the token columns are nullable.
  estimated_cost_usd numeric(12, 6),

  -- False for a request that errored. Those rows are kept: a failed call
  -- still consumed latency, and a mid-generation failure still consumed
  -- tokens. Excluding them would under-report real spend.
  ok boolean not null default true,
  streamed boolean not null default false,

  created_at timestamptz not null default now()
);

-- Cost-over-time and per-feature breakdowns are the two queries this
-- table exists to answer; both filter or group on these.
create index if not exists ai_usage_events_created_at_idx on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_feature_idx on public.ai_usage_events (feature, created_at desc);
create index if not exists ai_usage_events_model_idx on public.ai_usage_events (model, created_at desc);

-- RLS on with NO policies: writes go through the service-role client
-- (which bypasses RLS) and nothing in the app reads this table. That
-- makes it unreadable from any anon/authenticated session by default,
-- which is the correct posture for infrastructure cost data.
alter table public.ai_usage_events enable row level security;

-- ===================== USEFUL QUERIES =====================
--
-- Daily spend and volume:
--   select date_trunc('day', created_at) as day,
--          model,
--          count(*) as requests,
--          sum(input_tokens) as input_tokens,
--          sum(output_tokens) as output_tokens,
--          round(sum(estimated_cost_usd), 4) as est_usd
--   from public.ai_usage_events
--   group by 1, 2 order by 1 desc, est_usd desc nulls last;
--
-- Which feature costs the most (the question the audit could not answer):
--   select feature,
--          count(*) as requests,
--          round(avg(input_tokens)) as avg_input,
--          round(avg(output_tokens)) as avg_output,
--          round(avg(latency_ms)) as avg_latency_ms,
--          round(sum(estimated_cost_usd), 4) as est_usd
--   from public.ai_usage_events
--   where created_at > now() - interval '7 days'
--   group by feature order by est_usd desc nulls last;
--
-- Verify the model switch actually saved money (compare across the cutover):
--   select model, count(*) as requests,
--          round(avg(input_tokens)) as avg_input,
--          round(avg(estimated_cost_usd)::numeric, 6) as avg_cost_per_request
--   from public.ai_usage_events group by model;
--
-- Requests reporting no usage (should be streams only):
--   select streamed, ok, count(*) from public.ai_usage_events
--   where input_tokens is null group by 1, 2;
