# Product Domain Model

Status: **architecture only — no screens, schemas, or code.** This is the
foundation document beneath `docs/dashboard-architecture.md`,
`docs/dashboard-user-flows.md`, and `docs/content-lifecycle.md` — those
describe structure, behavior, and lifecycle; this document defines the
entities themselves, why each exists, and how they relate. Nothing here is a
database schema or a type definition — relationships are described in
prose, for whoever designs the actual schema/implementation later to
translate.

---

## Entity Map (at a glance)

```
User ──1:1── Learning Profile ──1:1── Learning Plan
  │                                        │
  │                                   (informs)
  │                                        ▼
  │                              Daily Mission (1 per day)
  │                                        │
  │                                    (points to)
  │                                        ▼
  │        ┌─────────────────────── Content Item ───────────────────────┐
  │        │   (universal)                                              │
  │        │   Podcast · Article · Story · Video · News ·                │
  │        │   Conversation · Challenge  (type-specific extensions)      │
  │        └───────────────────────────────────────────────────────────┘
  │                    ▲              ▲            ▲            ▲
  │                    │              │            │            │
  ├──1:N── Progress ───┘              │            │            │
  ├──1:N── Completion (event log) ────┘            │            │
  ├──1:N── Bookmark ────────────────────────────────┘            │
  ├──1:N── History (derived from Completion) ───────────────────┘
  │
  ├── Streak · XP · Weekly Goal · Achievements   (derived from History)
  ├── Tuto Messages (received)
  ├── Notifications (received, subset of Tuto Messages, out-of-app)
  └── (queries) Search Index, Recommendation      (cross-cutting, not owned by User)
```

This map is deliberately shallow: nearly everything traces back to `User` on
one side and `Content Item` on the other, with the Learning Brain
(Recommendation, §Learning Brain below) sitting between them rather than
being owned by either. That shape is what keeps the model stable as content
types and user count both grow by orders of magnitude.

---

## A. Identity & Guidance Layer

### 1. User
The authenticated identity. Owns exactly one Learning Profile and is the
root that every other entity in this document ultimately traces back to
(directly or through Learning Profile). Deliberately minimal —
authentication/session concerns live here, not learning-domain concerns —
so identity can evolve independently of how the product teaches.

### 2. Learning Profile
The learner's current inputs: English level (CEFR), goal, daily time
commitment, interests. This is what onboarding collects and what the
Learning Brain reads on every computation. **Not a frozen onboarding
snapshot** — a learner can revise their level/goal/interests later (Profile
tab), and any change is a first-class input the Learning Brain picks up on
its next run. One-to-one with User.

### 3. Learning Plan
The narrative roadmap presented at the end of onboarding (stat tiles, skills
schedule, 8-week roadmap). Distinct from Learning Profile: the Profile is
raw input, the Plan is the *derived, presented* artifact built from it.
Responsibility: gives the learner a durable sense of "this is my plan" that
Weekly Goal and Daily Mission both visibly ladder up to. Not necessarily
generated once and frozen forever — a meaningful Learning Profile change
(e.g. a goal change) is a legitimate reason to regenerate it later, even if
v1 only generates it once at onboarding.

### 4. Daily Mission
The single, guided "what to do today" — exactly one per learner per
calendar day, produced by the Learning Brain, consumed by Home. Points to
one Content Item (or an in-progress one, if resume-priority applies — see
`content-lifecycle.md` §10). Has its own lifecycle (pending → in_progress →
completed) that *mirrors* but is distinct from Progress: Daily Mission is
"the day's designated task," Progress is "how far into any given Content
Item this learner has gotten." A Daily Mission completes when its
underlying Content Item's Progress reaches `completed`.

Distinct from **Recommendation** (§5): Recommendation is the general-purpose
"what should this learner see" mechanism, reused across Home, Explore, and
Search. Daily Mission is one specific, singular, date-stamped commitment —
the top Recommendation for a given day, *promoted* to mission status.

### 5. Recommendation
The Learning Brain's scored, ranked output for a given learner and context
(Home / Explore / Search — see §Learning Brain). Not a single persisted
"thing" a user manages — think of it as the *result of a computation*,
possibly logged for explainability/debugging ("why was this shown"), never
something the learner directly edits. Many Recommendations (across many
contexts) can reference the same Content Item for the same User over time;
the single top Home Recommendation on a given day becomes that day's Daily
Mission.

---

## B. Content Layer

### 6. Content Item
The universal entity every piece of learning content is, first. A Podcast,
Article, Story, etc. is a Content Item *plus* a type-specific extension —
never a wholly separate model. This is the single shared identity that lets
Progress, Bookmark, History, Search, and Recommendation all work
identically regardless of type, and it's the load-bearing decision of this
entire domain model (see §Content Model below for its shared metadata).

**Important distinction**: "completion state" is *not* a property of the
Content Item itself — a Content Item is user-agnostic (the same podcast
exists whether or not any given learner has heard it). Completion state
lives on **Progress**, per user, per item.

### 7. Podcast
See the dedicated §Podcast Model below — it's the deepest content type
today and sets the pattern every future type follows.

### 8. Article
Content Item + a body (rich text) + estimated reading time, plus the same
universal enrichment attachments every content type gets (§Podcast Model's
Vocabulary/Key Expressions/Quiz/Reflection/Resources — these are *not*
podcast-specific, see the note at the end of that section).

### 9. Story
Content Item + narrative body, structurally similar to Article but often
naturally serialized. This is where a lightweight **Series** concept earns
its place: a Story (or a themed Podcast season, later) can be an ordered
group of Content Items sharing a `series` reference, rather than the model
needing a special "multi-part content" type. Series is a grouping concept
that applies to any content type, not a Story-specific field.

### 10. Video
Content Item + a video asset + captions/transcript (same enrichment pattern
as Podcast's transcript) + duration.

### 11. News
Content Item with one meaningful difference: **a much faster freshness
decay**. A podcast or story is largely evergreen; a news item is not. The
Learning Brain's freshness scoring (`content-lifecycle.md` §3) needs a
per-type decay rate, and News is the type that makes this explicit rather
than theoretical.

### 12. Conversation
Content Item structured as guided interactive dialogue practice. This is
very likely the productized form of the "future AI discussion" extension
point flagged under Podcast (§Podcast Model) — worth designing them as the
same underlying mechanism eventually: a structured Tuto-led dialogue,
attachable to a specific piece of content (discuss *this* podcast) or
standalone (a Conversation content item in its own right).

### 13. Challenge
Content Item with one deliberate exception to the rest of the model: where
every other type completes automatically on reaching its natural end
(`content-lifecycle.md` §8), a Challenge is likely to have explicit
pass/fail or scored criteria — closer to a game than passive consumption.
This is an intentional, documented branch in the completion model, not an
oversight: Challenge's Completion event carries an outcome, not just a
timestamp.

---

## C. Engagement & Memory

### 14. Progress
The join between User and Content Item over time: `not_started → in_progress
→ completed`, plus a type-appropriate position marker. This is the record
that everything downstream (Completion, History, Streak, XP, Resume) is
derived from. Full lifecycle detail in `content-lifecycle.md` §7.

### 15. Completion
Distinct from Progress on purpose: **Progress is current state (mutable,
one row per user+item), Completion is an event (immutable, timestamped,
appended)**. A learner can complete something once, and optionally revisit
it later (a second listen) — Progress's state stays `completed` while a new
Completion *event* can be logged for that re-engagement without corrupting
the original record. This state/event split is what makes History (§18),
Streak (§19), and XP (§20) reliable derived views rather than
easily-corrupted counters.

### 16. Resume Progress
Not a stored entity in its own right — a **derived view over Progress**:
"this learner's most recent `in_progress` item." Modeled as a query, not a
duplicate table, specifically to avoid a second copy of state that could
drift out of sync with Progress itself. This is what powers "Continue
Learning" and the resume-priority behavior in `content-lifecycle.md` §10.

### 17. Bookmark / Save For Later
A per-(User, Content Item) flag, independent of Progress — a learner can
bookmark something they've never started. Responsibility: personal
curation/intent, not engagement. Secondary role: a mild, positive input into
the Learning Brain even before any completion exists — bookmarking
something is a real (if weak) interest signal.

### 18. History
The full chronological timeline of a learner's engagement (every
Completion event, every item started) — distinct from Progress, which is
current state *per item*, not a timeline. History is what gets summarized
into the Progress tab's narrative view (`docs/design-system.md`: "not a wall
of stats") — History is the raw material, the tab is the story told from
it.

---

## D. Motivation & Reward

### 19. Streak
Derived from History/Completion: consecutive calendar days with at least
one completed **Daily Mission** — deliberately scoped to the guided daily
habit specifically, not just any content completion, so casual Explore
browsing can't incidentally inflate it. Lives on Learning Profile (current
count, longest count, last-active date). Full behavior in
`dashboard-user-flows.md` §C14/C15.

### 20. XP
A running score, incremented by Completion events, weighted (Daily Mission
completion counts for more than incidental Explore completion). Feeds a
Level. Purely motivational — never exposed as a percentage or graded score,
always framed as growth (`docs/design-system.md`'s "never feel like an
exam" applies here too).

### 21. Weekly Goal
A rolling target derived from Learning Plan's daily-time commitment × 7.
Deliberately measures something **different from Streak**: Streak rewards
daily consistency; Weekly Goal rewards total volume and tolerates gaps (a
learner who studies 45 minutes on 4 days out of 7 can still hit a 3-hour
weekly target without being penalized for the days they missed). Both
matter, for different reasons — one should never be collapsed into the
other.

### 22. Achievements
A catalog of discrete, named milestones (first completion, streak
milestones, level-ups, weekly-goal streaks, trying a new content type) plus
a per-user "earned" record. Achievements are **long-term memory** of
milestone moments — distinct from Tuto Messages (§23), which is the
momentary celebration when one is first earned.

---

## E. Voice & Communication

### 23. Tuto Messages
The catalog of everything Tuto can say, each entry keyed to a triggering
condition (greeting variants, completion celebrations, streak-loss
recovery, weekly-goal moments, new-content announcements, Coming-Soon
redirects, search-empty-state framing — the full catalog is enumerated in
`dashboard-user-flows.md`'s "Where Tuto Participates" table). Responsibility:
decouples *what triggers a message* from *what Tuto actually says*, with a
selection layer that picks the right variant and never stacks more than one
at a time. Worth treating this catalog as content in its own right (a Tuto
Message is a tiny, structured unit: trigger condition + copy + optional
pose/animation reference) rather than hardcoded strings — the same
"managed catalog, not code" principle applied everywhere else in this
model.

### 24. Notifications
The outside-the-app extension of a subset of Tuto Messages (streak-risk
reminders, re-engagement nudges, weekly recaps) delivered via push/email.
Kept distinct from Tuto Messages because delivery has its own concerns —
device tokens, scheduling, quiet hours, frequency capping, opt-in/consent —
that in-app messaging doesn't. **Frequency capping and honoring quiet hours
are first-class requirements, not an afterthought**, given the brand's
"never nagging, never guilt-based" principle already established for
streak loss (`dashboard-user-flows.md` §C14).

### 25. Search Index
A unified, cross-content-type searchable projection over every Content Item
(title, description, and enrichment text — transcripts, article bodies)
plus its tags. Explicitly **not a separate content system** — an index/view
over the same universal Content Item model, which is exactly what lets one
search for "business" return a Podcast, Article, Story, Video, News,
Conversation, or Challenge from a single query. Detailed in §Search
Architecture below.

---

## Content Model (Universal Metadata)

Every Content Item, regardless of type, carries:

| Field | Purpose |
|---|---|
| `content_type` | discriminator (podcast, article, story, video, news, conversation, challenge) |
| `cefr_level_min/max` | difficulty range, drives level-match scoring |
| `estimated_time` | universal time unit (minutes) — independent of type-specific duration/reading-time fields, so the Learning Brain can compare a 10-minute podcast to a 10-minute article directly |
| `topics` | subject-matter tags, same controlled vocabulary as onboarding interests (Technology, Travel, Business, …) |
| `skills` | **which English competency this item exercises** (Reading, Listening, Speaking, Writing, Grammar, Vocabulary) — distinct from `topics` (subject matter) and worth calling out as its own field: this is what lets the Learning Brain balance *skill coverage* over time (the Skills Schedule already shown on the `/ai-plan` reveal implies the product already cares about this), not just topic/level matching |
| `goal_alignment` | same controlled vocabulary as the onboarding Goal step |
| `tags` | freer-form/editorial labels ("beginner-friendly," "trending") distinct from the controlled `topics`/`skills` vocabularies — an organizational escape valve, not a primary matching signal |
| `publish_date` | freshness signal, decay rate varies by type (News decays fast, Podcast/Story near-evergreen) |
| `premium/free` | **forward-looking flag** — monetization isn't in scope today, but reserving this now means it doesn't require a model change whenever it arrives |
| `featured` | an editorial override letting a human promote something regardless of algorithmic score — used sparingly, exists for launches/quality moments, never the primary discovery mechanism |
| `series` | optional grouping reference for ordered/multi-part content (§9) |

Two clarifications worth stating plainly, since the source brief lists them
alongside the fields above:

- **"recommended" is not a stored field.** It's the *output* of the Learning
  Brain (Recommendation, §5) — personalized, per-user, computed — as opposed
  to `featured`, which is a static, editorial, non-personalized override.
  Conflating the two would reintroduce exactly the kind of "algorithmic
  black box vs. human-curated shelf" confusion this model is trying to keep
  separate.
- **"completion state" is not a Content Item field** — see §6's note. It's
  per-user, and it lives on Progress.

---

## Podcast Model (the pattern every future type follows)

The brief asks to think beyond audio — here's the shape:

- **Audio** — the core listening asset. The only piece truly unique to
  "podcast-ness."
- **Transcript** — time-aligned text. More than a caption: it's a bridge
  between skills — a podcast's transcript can double as a *reading*
  exercise, meaning one Content Item can legitimately serve both the
  Listening and Reading skill tags (§Content Model) simultaneously.
- **Vocabulary** — key words surfaced from *this* item.
- **Key Expressions** — idioms/colloquial phrases, distinct from
  single-word Vocabulary.
- **Quiz** — a light comprehension/vocabulary check. Never gates
  completion (completion is automatic on reaching the end, per
  `content-lifecycle.md` §8) and is never scored like an exam — reinforcement,
  not evaluation.
- **Reflection** — an open-ended, low-pressure prompt after finishing.
- **Resources** — supplementary/related links — the seed of a general
  "related content" relationship between Content Items, not a podcast-only
  idea.
- **Future AI discussion** — a Tuto-led conversation *about* this specific
  item. Forward-looking, and very likely the same underlying mechanism as
  the Conversation content type (§12).

**The key architectural insight**: only Audio and Transcript are genuinely
podcast-specific. Vocabulary, Key Expressions, Quiz, Reflection, and
Resources are **universal enrichment attachments** that Article, Story,
Video, News, Conversation, and Challenge should all be able to carry the
same way. Modeling them once, as attachable-to-any-Content-Item components,
rather than rebuilding "Article Quiz," "Video Quiz," etc. per type, is
precisely what keeps this model from becoming duplicated and siloed as new
types launch.

---

## Learning Brain (Internal Logical Model)

A layered decision process, computed per learner, per context:

**Layer 1 — Eligibility filter.** Only `published` Content Items with
complete required metadata are candidates at all (unpublished/incomplete
items are structurally invisible to every layer below this one).

**Layer 2 — Scoring** (detailed in `content-lifecycle.md` §3): level match,
goal alignment, topic overlap, skill-coverage balance, freshness
(type-aware decay), and a repetition penalty for recently shown/completed
items (steep, not absolute — see `content-lifecycle.md` §9 for why).

**Layer 3 — Context-specific selection**, all built on the same Layer 2
score, but consumed differently:
- **Today's Mission**: a finite daily plan of two independent slots, one
  article and one podcast — each slot is its resume-priority item if one
  exists, else the top score for that content type. Each slot is locked
  for the calendar day once assigned, and is never re-assigned once
  completed (no third slot, no regeneration mid-day).
- **Continue Learning**: not a score at all — a direct Resume Progress
  (§16) query.
- **Tuto Recommends**: the next several scored items, excluding whatever is
  already the Mission.
- **Explore**: the full sorted list for the active content type, with
  manual filters layered on top as an override.
- **Search ranking**: text-match relevance blended with the same
  personalization score, so a search result list is still personalized, not
  neutral (`content-lifecycle.md` §4).

**Layer 4 — Progression.** Two slow-moving signals that adjust over weeks,
not per-session: **difficulty progression** (as a learner completes
higher-level content, gradually widen/shift the level range Layer 2 scores
against — the mechanism behind "Reach B2 in ~8 weeks" on the `/ai-plan`
reveal actually holding true over time) and **goal progression** (sustained
completion of goal-aligned content is a legitimate signal the Learning Plan
itself could mature, tying back to Learning Plan (§3) being a living
document rather than a frozen one-time output).

---

## Search Architecture

One unified Search Index (§25) over the universal Content Item plus its
enrichment text (transcripts, article bodies) and tags — never a
per-content-type search system. `content_type` is a filter facet on the
index, not a partition boundary, which is exactly what lets a query like
"business" return a Podcast, Article, Story, Video, News, Conversation, and
Challenge from one query path. Ranking is text relevance blended with the
Learning Brain's personalization score (Layer 2/3 above) — a search result
list is never purely neutral/chronological.

---

## Scalability (10,000+ podcasts, 20,000+ articles, 15,000+ stories, 5,000+
## videos, millions of users)

- The universal Content Item + per-type extension pattern (§6) is what
  prevents schema blowup as types and volume both grow — this was true at
  13 items and remains true at hundreds of thousands.
- Recommendation scoring cannot be a live full-catalog scan per request at
  this volume — Layer 1's eligibility filter (published, complete metadata)
  plus hard pre-filters (level range, goal) must narrow the candidate pool
  *before* Layer 2 scoring runs, standard information-retrieval shape, not
  a brute-force pass over everything.
- Search Index (§25) becomes real search infrastructure (an inverted
  index/dedicated search service) at this volume, not a database
  pattern-match query.
- Series (§9) organizes volume without proliferating unrelated single
  items — a themed collection is one grouping concept, not N content items
  with no relationship to each other.
- Progress/History/Streak/XP are per-user, append-mostly data with no
  required cross-user joins — this scales horizontally by construction,
  and it's a case where product philosophy directly helps scalability: this
  model deliberately has **no leaderboards** (`docs/design-system.md`,
  `docs/dashboard-architecture.md` §12), so there's no expensive
  cross-user ranking query anywhere in the design to begin with.

---

## Expansion Strategy

Launching a new content type is always the same additive sequence, at the
domain level:

1. Define its type-specific extension (its own handful of unique fields —
   Podcast's Audio/Transcript, Video's video asset, etc.).
2. Reuse the universal enrichment attachments (Vocabulary, Key Expressions,
   Quiz, Reflection, Resources) rather than rebuilding them.
3. Tag it into the universal Content Item taxonomy (`content_type`, level,
   topics, skills, goal_alignment).
4. It is now visible to the Learning Brain, Search, Progress, Bookmark, and
   History automatically — none of those five systems change when a sixth
   or seventh content type arrives, because none of them were ever built
   against a specific type in the first place.

---

## What to Avoid (explicit, non-negotiable)

- **Duplicated models** — one Progress table, one Bookmark table, one
  History timeline, ever, regardless of how many content types exist.
- **Separate recommendation systems per content type** — one Learning
  Brain, one scoring function; `content_type` is a facet the score
  considers, never a reason to fork the engine.
- **Content silos** — every type shares Content Item plus the universal
  enrichment attachments; a type-specific "Article system" living apart
  from "Podcast system" is exactly the failure mode this whole document
  exists to prevent.
- **Rewriting architecture per new content type** — if adding Articles ever
  requires changing how Search, Progress, or the Learning Brain work, the
  model has failed; the Expansion Strategy above should be the entire
  story, every time.
