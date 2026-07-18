# Content Lifecycle

Status: **architecture only — no screens approved yet.** Companion to
`docs/dashboard-architecture.md` (structure/IA, universal `content_items`
schema) and `docs/dashboard-user-flows.md` (moment-by-moment user behavior).
This document defines the complete life of a piece of learning content, from
how it enters the system to how it stops being recommended, and the
philosophy behind the Learning Brain that governs it — built to hold at 13
podcasts and at thousands of items across many content types, without a
redesign in between.

---

## 1. How Content Enters the System

Every content item, regardless of type, goes through the same four stages
before it can be recommended:

1. **Sourcing** — authored in-house, licensed, or imported (today: the 13
   podcasts under `content/legacy-podcast-lessons/` plus the
   `supabase/remote-lessons.sql` remote pipeline; future types will each
   have their own sourcing method, but the same pipeline stages).
2. **Ingestion** — written into `content_items` (universal fields: title,
   description, `content_type`, `cefr_level_min/max`, `topics`,
   `goal_alignment`) plus the relevant `*_details` table (e.g.
   `podcast_details`: audio URL, transcript, duration).
3. **Quality gate** — a piece of content is not eligible for
   recommendation or Explore listing until its required metadata is
   complete (see §2 — a content item with no level or topic tags cannot be
   matched, so it cannot enter circulation). This gate is a data
   completeness check, not an editorial opinion system.
4. **Publish** — `status` flips from `draft`/absent to `published`. Only at
   this point does it become visible in Explore and eligible for the
   Learning Brain.

At small volume (13 items) this can be a manual step. At volume, stage 2–3
should be enforced by the ingestion pipeline itself (reject a row missing
required tags) rather than caught later — see `dashboard-architecture.md`
§10 for when a dedicated ingestion tool becomes necessary.

---

## 2. Metadata Structure

Two tiers, matching `dashboard-architecture.md` §7:

**Universal fields** (every content item, every type — these are what the
Learning Brain, search, and Explore's filters operate on):

- `content_type` — podcast | article | video | news | story | conversation
  | challenge
- `cefr_level_min` / `cefr_level_max` — the level range this item suits
  (a range, not a single level, since most content is usable slightly above
  or below a learner's exact level)
- `topics` — same tag vocabulary as onboarding interests (Technology,
  Business, Science, Movies, Books, Gaming, Music, Travel, Sports, Food, …)
- `goal_alignment` — same vocabulary as the onboarding Goal step (General
  English, Speaking, Business English, Travel, Work, School, Exam
  Preparation)
- `status` — draft | published | coming_soon (see §12)
- `published_at` — drives freshness scoring (§4) and "New" surfacing (§11)

**Type-specific fields** (in the matching `*_details` table): a podcast
needs `audio_url`/`transcript_url`/`duration_seconds`; a future article
needs `body`/`reading_time_minutes`; a future video needs
`video_url`/`captions_url`/`duration_seconds`. These never leak into the
universal table — the Learning Brain and search never need to know a
podcast has an `audio_url` to recommend or find it, only the player screen
does.

This split is what lets §12 (new content types going live) be additive:
a new `*_details` table plus rows tagged with the universal fields, nothing
about the universal schema changes.

---

## 3. How the Learning Brain Evaluates Content

Every published, untaken (or long-since-completed, see §9) content item is a
candidate. For a given learner, each candidate gets a score:

```
score = level_match           (learner's level falls within the item's range)
      + goal_alignment_match   (item tagged with the learner's goal)
      + topic_overlap          (shared tags with the learner's interests)
      + freshness              (newer items and items not recently shown score higher)
      + variety_bonus          (once >1 content type is live, mix them across
                                 consecutive missions rather than repeating one type)
      - repetition_penalty     (recently completed or recently shown items score lower,
                                 not zero — see §9 for why "not zero" matters)
```

This is deterministic and explainable by design (§4/Learning Brain
Philosophy below covers why). It is *not* a black-box model at launch — see
`dashboard-architecture.md` §8 for the V1→V2 (rule-based → learned model)
path, which swaps the internals of this function without changing anything
downstream of it.

---

## 4. How Tuto Recommends Content

The score in §3 is an internal ranking signal — it is never shown to the
learner as a number or percentage. What the learner sees is:

- **Home**: the single top-ranked item, framed as "Tuto picked this for
  you," optionally with one soft, human reason ("because you're into
  Travel") — never the literal score breakdown.
- **Explore's Tuto Recommends strip**: the next several ranked items,
  scoped to whichever content type tab is active.
- **Search**: ranking influences order but never hides results a learner
  explicitly searched for — a direct search intent outranks the
  recommendation score.

---

## 5. How Content Is Surfaced on Home

Today's Mission is a **finite daily plan**, not an endless recommendation
stream: exactly one article slot and one podcast slot, each computed
**once per calendar day**, not on every app open (see Learning Brain
Philosophy §"When should recommendations change" below for why), and each
tracked to completion independently. Within that same day, reopening the
app shows the same two slots — completing one never causes the other, or
a third item, to be generated. This is what makes Home feel like a
considered daily plan rather than a slot machine.

Once both slots are completed, Home shows an explicit "Today's Mission
Completed" state for the rest of that calendar day, with a countdown to
when tomorrow's plan unlocks — never a silently-regenerated new mission.

---

## 6. How Content Appears in Explore

Explore's full list for the active content type is sorted by the same §3
score by default (relevance-first, not chronological or alphabetical), with
manual filters (level, topic, duration) layered on top as an opt-in override
— per `dashboard-architecture.md` §5, filters are secondary, never the
primary path.

---

## 7. How Progress Is Tracked

A `progress` row exists per `(user_id, content_item_id)` with:

- `status`: not_started (no row yet) → in_progress → completed
- a position marker appropriate to the content type (podcast: playback
  position in seconds; a future article: scroll position or a paragraph
  index; a future video: playback position) — the exact shape of "position"
  is type-specific, but the state machine (not_started / in_progress /
  completed) is universal and is what the rest of the system (Home,
  recommendations, streaks) actually reasons about.

---

## 8. How Completion Is Recorded

Completion is **automatic** for content with a natural end point (reaching
100% of a podcast/video) and is recorded the instant that threshold is
crossed — not a manual "mark as done" action, which would introduce
friction and unreliable data. Content types without a natural end point
(e.g. a future "Challenge") define their own completion criteria, but the
event they emit into the system is identical: a `progress.status =
completed` write with a timestamp, which is all downstream systems
(streaks, XP, recommendation freshness) consume.

---

## 9. How Recommendations Change After Completion

The moment a completion is recorded (§8):

- That item's freshness score drops sharply but **not to a hard exclusion**
  — at 13 podcasts, a hard "never show again" rule would exhaust the catalog
  quickly for an active learner; a steep-but-recoverable penalty means a
  completed item can resurface much later (e.g. for review) rather than
  vanishing forever. At high content volume this penalty can be much
  stricter, since there's always something else to surface — the *rule*
  (steep penalty, not hard exclusion) doesn't change, only its practical
  effect does as the catalog grows.
- The next Learning Brain computation (next day, per §5) has one more data
  point about the learner's actual behavior (what they finished, how long
  it took relative to the estimate) feeding into future scoring.

---

## 10. How Unfinished Content Behaves

An `in_progress` item is never silently abandoned by the system. Concretely:

- If a learner starts something and doesn't finish it, **that item takes
  priority the next time Today's Mission is computed** — the Learning Brain
  offers to resume it before offering anything new. This directly answers
  "should yesterday's mission influence today's": yes, if it's unfinished,
  it *is* today's mission again, not competing with a new one.
- This priority decays, not indefinitely — an item abandoned for a long
  stretch (design-time threshold, not fixed here) eventually stops being
  force-resumed and returns to being a normal candidate, so a learner isn't
  stuck being offered a months-old abandoned item forever. It remains
  reachable manually (Explore, Progress) regardless.

---

## 11. How New Content Becomes Discoverable

New content gets a temporary freshness boost in the §3 scoring (the
opposite of the repetition penalty in §9) so it has a fair chance of
surfacing rather than being buried under already-established, previously
well-performing items. The first time a new item matches a given learner's
profile strongly enough to become their Today's Mission or appear in Tuto
Recommends, it can carry a one-time "new" framing from Tuto ("Tuto just
added something new that fits you") — not a permanent badge, a one-time
introduction.

---

## 12. How "Coming Soon" Content Types Transition Into Live Products

1. The content type already exists as a taxonomy value and an Explore chip
   from day one (`dashboard-architecture.md` §5/§10) — nothing to build
   here when launch day arrives.
2. Content is sourced and ingested (§1) ahead of launch, not on launch day.
3. **Minimum viable catalog check**: the chip does not flip live at 1 item.
   It needs enough items to span a reasonable spread of levels and at least
   a few topics — launching with one lonely article makes the Learning
   Brain unable to serve most learners and makes the type feel hollow
   rather than genuinely available. The exact threshold is a launch-review
   decision, not a fixed number here, but the principle (spread, not just
   count) is fixed.
4. The chip flips from Coming Soon to live; the Learning Brain immediately
   starts considering the new type in scoring (§3) with no code change,
   since it already operates on the universal schema.
5. Existing learners whose profile matches the new content well get a
   one-time Tuto-voiced announcement moment the first time it's recommended
   to them (ties to §11's "new content" framing) rather than the type
   silently appearing with no acknowledgment.

---

## Learning Brain Philosophy

Direct answers to the standing questions, as design principles for whoever
implements or evolves the recommendation engine:

**Why does Tuto recommend this podcast?**
Because it's the highest-scoring candidate (§3) for that learner at that
moment — level-appropriate, aligned with their stated goal, overlapping
their interests, and not something they just did. The system must always be
able to answer this internally (the score is explainable by construction),
even though the learner is only ever shown a soft, human version of the
reason, never the mechanism.

**When should recommendations change?**
Today's Mission changes once per calendar day, not on every app open —
that's what makes it feel like a considered daily plan rather than a
refreshing feed. The secondary Tuto Recommends strip in Explore can be more
fluid (recomputed each visit) since it's explicitly a secondary, exploratory
surface, not the day's one guided choice. Anything changes immediately after
a completion event (§9) or a profile change (e.g. the learner updates their
level or goal later in Profile settings) — the *next* computation reflects
it, not a live recalculation mid-session.

**Should yesterday's mission influence today's mission?**
Yes, in exactly one specific way: if yesterday's mission wasn't finished, it
*is* today's mission again (§10) — unfinished work is never buried under a
fresh pick. If it *was* finished, today's pick should feel like forward
progress (next in a sequence, or a new facet of the same goal), not a
repeat, which is what the freshness/repetition scoring in §3/§9 enforces
mechanically.

**How much exploration should be allowed vs. how much should remain
guided?**
Guided by default, exploration by choice. Home is 100% guided — one mission,
no decision required. Explore exists precisely to hold 100% of the
exploration appetite, entered deliberately, never forced or auto-suggested
as "you should browse more." As a design north star (not a hard quota): most
engagement should happen through the guided surfaces (Today's Mission + Tuto
Recommends); Explore's free browsing is the release valve for learners who
want agency in a given session, not the primary path for anyone. If usage
data ever shows the majority of engagement happening in Explore instead of
through guided surfaces, that's a signal the guided experience isn't trusted
enough yet — not a signal to make Explore more prominent.

---

## Three-Year Lens

Nothing in this document assumes 13 podcasts. The state machine (§7), the
scoring shape (§3), the ingestion stages (§1), and the Coming-Soon-to-live
playbook (§12) are all written to be exercised identically whether there are
13 items or 13,000 across seven content types — the only things that change
with scale are thresholds (how strict the repetition penalty is, what
"minimum viable catalog" means) and tooling (manual ingestion becomes a
pipeline), never the underlying model.
