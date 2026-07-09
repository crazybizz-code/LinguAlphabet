# Dashboard Product Architecture

Status: **architecture only — no screens approved yet.** This document defines
how the post-onboarding product works before any Base44 design or Next.js
implementation begins. Nothing here is a UI spec; it is the product/data
model that a future visual design must express.

Scope: everything a learner sees after `/ai-plan` → `/dashboard`. Read
alongside `docs/design-system.md` (visual philosophy) and `CLAUDE.md`
(product model summary) — this document is the detailed expansion of both.

---

## 1. Dashboard Philosophy

LinguAlphabet is not a content platform. It is not Netflix, YouTube, Spotify,
or Duolingo. The moment a learner opens the app, they should never have to
decide what to do — Tuto and the Learning Brain have already decided. The
Dashboard's entire job is to answer one question instantly: **"What do I do
right now?"** — not "what's available to browse."

This has a direct architectural consequence: **Home and Explore are not
peers.** Home is where the product tells the learner what to do. Explore is
where a learner who *wants* to browse can, but browsing is never the default
path and never the first thing shown. A returning learner always lands on
Home, never on a content grid.

Progress is a feeling, not a spreadsheet. Streaks, minutes, and level exist
to reinforce momentum ("you're doing this"), never to interrogate the
learner with percentages, leaderboard-style rankings, or exam-like scoring.
This is the same principle already established for onboarding ("never feel
like an exam") — it now extends to the entire post-onboarding product.

---

## 2. Information Architecture

Four top-level destinations, flat, no nesting beyond one level deep from any
of them (max 2 taps to reach any piece of content from app open):

```
Home        — "what should I do today" (default landing)
Explore     — front door into the Knowledge Hub, for learners who want to browse
Progress    — streak / momentum / achievements (narrative, not a stats wall)
Profile     — account, settings, plan summary from onboarding
```

**Knowledge Hub is not a fifth destination.** It is the content system
Explore is built on top of (see §6/§7) — there is no separate "Knowledge Hub"
nav item a learner taps; Explore *is* the Knowledge Hub's front door. This
keeps the nav flat and avoids two destinations that would otherwise compete
for the same "browse content" job.

Search lives inside Explore, not as its own top-level destination (§9).

No hamburger menu, no drawer, no settings buried three levels deep. Every
screen a learner can reach is one of these four, or one level under one of
these four (e.g. a single podcast's detail screen, one level under Explore).

---

## 3. Navigation Structure

- **Mobile**: fixed bottom tab bar, exactly 4 tabs (Home / Explore / Progress
  / Profile). No 5th tab, no "more" overflow menu — if a 5th destination is
  ever needed, it must replace one of the four or become a screen reached
  *from* one of them, not a 5th tab.
- **Desktop/tablet**: same 4 destinations, presented as a left rail or top
  nav (exact treatment is a design decision for Base44, not this document) —
  the IA does not change shape across breakpoints, only its chrome.
- Tuto is not a nav item, but his presence persists globally in a small,
  consistent way (exact mechanism — floating badge, corner avatar, etc. — is
  a design decision; the requirement is that Tuto's presence is felt on
  every screen, not just Home).
- No screen is ever navigated to that isn't reachable from one of the 4 tabs
  within 2 taps. This is a hard constraint, not a guideline.

---

## 4. Home Structure

Top to bottom, in priority order:

1. **Greeting** — personalized, time-of-day aware ("Good morning, {name}"),
   with streak indicator if the learner has one. Small, quiet, not a hero.
2. **Today's Mission** — the hero of the screen. One card, one piece of
   content, one CTA ("Continue" or "Start"). This is the Learning Brain's
   single top-ranked recommendation for *right now*. There is deliberately
   only one — never a top-3 "choose one" list here, that's Explore's job.
3. **Tuto's note** — a short, contextual, personality-driven message tied to
   the learner's actual state (e.g. "Two more days to a 7-day streak" /
   "Nice work finishing yesterday's podcast"). Optional per visit — Tuto
   doesn't always have something to say, and forcing one on every load would
   cheapen it.
4. **Tuto Recommends** — a short, secondary carousel (2–4 items) of other
   Learning-Brain-picked content, explicitly framed as Tuto's picks. This is
   the only place on Home where more than one content choice appears, and
   it's still curated, not a browse grid.
5. **Progress snapshot** — streak, this week's minutes, current level —
   presented as a narrative strip (icons + short labels), not a dashboard of
   stat tiles or percentage bars. Tapping it goes to the Progress tab for
   anyone who wants more.

Nothing below this. Home does not have a footer of "more content" — that
temptation is exactly what turns it into a content platform. If a learner
wants more, that's what Explore is for.

---

## 5. Explore Structure

Explore is the browsing surface for learners who *want* to choose, but every
path through it still carries Tuto's voice — it is never a neutral catalog.

```
Explore
├── Content-type selector (horizontal chips/tabs, not a dropdown)
│     🎧 Podcasts   📖 Articles*   📹 Videos*   📰 News*
│     📚 Stories*   🗣 Conversations*   🎯 Challenges*
│     (* = Coming Soon — see §10 for how these render)
├── Search (see §9)
├── "Tuto Recommends" strip — personalized subset, always shown first,
│     inside whichever content type is active
├── Filters — level, topic/interest, duration — secondary, collapsed by
│     default, never the primary path to content
└── Full list/grid of the active content type
```

Only **Podcasts** is a live content type today. Selecting a Coming Soon chip
doesn't 404 or hide the tab — it shows a Coming Soon state (§10) so the
learner knows the roadmap exists without being able to act on it yet.

Even the "full list" at the bottom is never presented as a flat, neutral
grid — it's still sorted/framed by relevance to the learner's onboarding
profile (level, goal, interests) by default, with manual filters available
but not required.

---

## 6. Knowledge Hub Structure

Knowledge Hub is **not a screen** — it's the name for the unified content
system that Explore presents. Conceptually:

```
Knowledge Hub
 = the universal content system (see §7 for the data architecture)
 + the taxonomy every content item is classified by:
     - content_type      (podcast | article | video | news | story |
                           conversation | challenge)
     - cefr_level         (A1–C2, may be a range)
     - topics             (same tag set as onboarding interests: Technology,
                           Business, Science, Movies, Books, Gaming, Music,
                           Travel, Sports, Food, ...)
     - goal_alignment      (General English, Speaking, Business English,
                           Travel, Work, School, Exam Preparation)
     - status             (published | coming_soon)
```

This taxonomy is what makes recommendation, search, and filtering work
identically across every content type, today and in the future — a podcast
and a future "Article" are the same kind of object to the system, differing
only in their type-specific payload (§7).

---

## 7. Universal Content Architecture

The hard requirement driving this section: **13 podcasts today must not
require a different system than 1,000 podcasts + 1,000 articles + 500 videos
tomorrow.** That rules out a single wide table with dozens of nullable,
type-specific columns, and rules out a separate, independent schema per
content type (which would also mean separate progress/bookmark/search code
per type — an unscalable multiplication of effort).

Recommended shape:

```
content_items                      -- universal core, one row per piece of content
  id
  content_type        (enum: podcast | article | video | news | story |
                        conversation | challenge)
  title
  description
  cefr_level_min / cefr_level_max
  topics               (tag array or join table)
  goal_alignment       (tag array or join table)
  status               (published | coming_soon)
  thumbnail_url
  published_at
  created_at / updated_at

podcast_details          -- 1:1 with content_items where content_type = podcast
  content_item_id (FK)
  audio_url
  transcript_url
  duration_seconds

article_details          -- future, same pattern
  content_item_id (FK)
  body / reading_time_minutes

video_details             -- future, same pattern
  content_item_id (FK)
  video_url / captions_url / duration_seconds

...one *_details table per future content type, same FK pattern.
```

Progress, bookmarks, and notes generalize the same way. The existing
`progress` table (currently `podcast_id`-specific, per `supabase-schema.sql`)
should become `content_item_id`-based once a second content type ships, so
completion/position tracking is shared infrastructure, not rebuilt per type.
This is a migration to plan for, not to execute now — Podcasts-only doesn't
require it yet, but the Dashboard implementation should be written against
a `content_item_id` abstraction from day one so that migration is additive,
not a rewrite.

`supabase/remote-lessons.sql` already anticipates a remote content pipeline
for podcasts — that pipeline should feed `content_items` + `podcast_details`
directly rather than a podcast-only table, so it doesn't need replacing when
the second content type arrives.

---

## 8. Recommendation System ("the Learning Brain")

**Inputs** (all already collected or trivially trackable):
- Onboarding profile: `english_level`, `goal`, `daily_time_minutes`,
  `interests`
- Engagement history: completed content, in-progress content (from
  `progress`), recently shown content (to avoid repeats)
- Recency/spacing: don't resurface the same item or topic back-to-back

**Output**: a ranked list of content. Home consumes the top 1 result (Today's
Mission) plus the next 2–4 (Tuto Recommends). Explore's "Tuto Recommends"
strip consumes a broader slice of the same ranking, scoped to whichever
content type is active.

**V1 (launch-ready, rule-based, no ML required)** — a scoring function per
candidate content item:

```
score = level_match          (cefr_level within/near the learner's level)
      + goal_alignment_match  (content tagged with the learner's goal)
      + topic_overlap         (shared tags with learner's interests)
      + freshness             (penalize recently shown/completed items)
      + variety_bonus         (once >1 content type exists, mix them)
```

This is deterministic, explainable ("why am I seeing this" is always
answerable), and cheap to compute at 13 or 1,000 items. It should live behind
a single service boundary (e.g. `getRecommendations(userId, { contentType?,
limit })`) so V2 can replace the scoring internals without Home/Explore
changing at all.

**V2 (future, once usage data exists)**: collaborative-filtering or
embedding-based similarity, layered behind the same service boundary. Not a
launch requirement — noted here so the V1 architecture doesn't paint the
product into a corner.

**Naming, non-negotiable**: every surface of this system is labeled
**"Tuto Recommends"** / **"Recommended by Tuto"** / **"Tuto's Picks."** Never
"AI Recommended," "AI Suggested," or "AI Picks" anywhere in the product. The
learner has a relationship with Tuto, not with "the algorithm."

---

## 9. Search Architecture

- Lives inside Explore — not a 5th nav destination, not a global omnipresent
  search bar. Searching is a browsing action, and browsing belongs to
  Explore.
- Queries run against the universal `content_items` table (`title`,
  `description`, `topics`) so search spans every content type at once by
  default; results can be filtered to one content type after the fact, same
  as the rest of Explore.
- Empty/no-result states are voiced by Tuto, not a bare "no results found" —
  e.g. searching a term that only matches a Coming Soon content type should
  say so in Tuto's voice, not silently return nothing.
- Future: autocomplete/suggested queries informed by the learner's interests
  and what the Learning Brain already knows about them — not a generic
  trending-search box.

---

## 10. Future Expansion Strategy

Adding a new content type (e.g. Articles going live) should be an additive
checklist, never a redesign:

1. Add `article_details` table (or equivalent), FK'd to `content_items`.
2. Backfill/ingest content rows into `content_items` with
   `content_type = article`.
3. Flip its Explore chip from Coming Soon to live — no new chip, no nav
   change, no new screen pattern (Explore's list/grid/filter/search
   structure already applies).
4. The Learning Brain immediately starts considering it, since scoring
   operates on the universal schema — no recommendation-system change
   required.

**Coming Soon is a strategy, not a placeholder apology.** Every not-yet-live
content type is visible in Explore's chip row from day one (§5), so the
roadmap is transparent and the product feels like it's growing, rather than
each new type appearing to materialize from nowhere. Tapping a Coming Soon
chip shows a short, Tuto-voiced "this is coming" state — never a dead link,
never hidden entirely.

**Content volume scaling** (13 → thousands): today's manual/seed content
process (per `content/legacy-podcast-lessons/`) works at dozens of items but
will not work at hundreds+. At some point before that threshold, a proper
ingestion/authoring pipeline (even a simple internal tool writing into
`content_items`) becomes necessary. Not a launch requirement — a flagged
future dependency.

**Explicitly out of scope, by design**: multi-language support. LinguAlphabet
teaches English only, full stop — there is no target-language or
native-language concept anywhere in this architecture, and none should be
added later without a separate, explicit product decision.

---

## 11. UX Principles

- One primary action per screen, always. If a screen has two competing CTAs,
  it's wrong.
- Tuto's voice frames every recommendation surface — "Tuto Recommends," never
  "AI Recommended."
- No percentages, no exam-like scoring, no leaderboard-style ranking of the
  learner against others. Progress is personal and narrative.
- Coming Soon content types are visible, not hidden — transparency about
  what's next builds trust rather than eroding it.
- Every empty state and loading state is Tuto-voiced and uses his idle
  animations (breathing/thinking) rather than a generic spinner — consistent
  with "Tuto is the AI coach, not decoration."
- Flat IA: nothing is more than 2 taps from app open.
- Desktop-first responsive, but the *information architecture* never shrinks
  on mobile — only the layout reflows. No feature is mobile-only or
  desktop-only.

---

## 12. Things to Avoid

- A Home screen that's actually a content grid with extra steps (the
  Netflix/Spotify trap this whole architecture exists to avoid).
- Percentage-based progress bars as the primary progress metaphor.
- "AI Recommended" / "AI Suggested" / "AI Picks" language anywhere.
- Treating Explore as equal-priority to Home — a returning learner always
  lands on Home.
- A 5th nav tab, a hamburger menu, or any navigation deeper than one level
  under one of the 4 top-level destinations.
- Building each new content type as its own independent system (own progress
  table, own recommendation logic, own search) instead of extending the
  universal `content_items` model — this is the single biggest risk to
  "still makes sense at thousands of items."
- Exam-like assessments or scoring anywhere post-onboarding, consistent with
  the onboarding principle already established.
- A "Knowledge Hub" nav item competing with "Explore" for the same job —
  there is one browsing surface, not two.
