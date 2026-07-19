# Dashboard User Flows

Status: **architecture only — no screens approved yet.** Companion to
`docs/dashboard-architecture.md` (structure/IA) and `docs/content-lifecycle.md`
(how content itself behaves). This document is the moment-by-moment
behavior of the product across every flow a learner goes through, so Base44
can design the complete experience rather than a set of disconnected
screens.

Every flow below follows the same shape: **Entry point → User actions →
System actions → Tuto interactions → Exit state.** Where a flow references a
content or recommendation concept in more depth, see `content-lifecycle.md`.

---

## A. The Core Daily Loop

### A1. App open (returning learner, has an active session)

- **Entry point**: learner opens the app/site with a valid session.
- **User actions**: none yet — this is the moment before any decision.
- **System actions**: load learner state (streak, last-active date, current
  level, in-progress content); Learning Brain computes today's Today's
  Mission if one hasn't already been computed for today (see
  `content-lifecycle.md` §Learning Brain for when this recomputes);
  determine which Tuto's-note variant applies (see A9).
- **Tuto interactions**: greets by name, time-of-day aware. If there's a
  contextual note to deliver (streak milestone, welcome back after absence,
  celebration of yesterday's completion), it renders here — but not every
  open has one; forcing a message every time cheapens it.
- **Exit state**: Home, showing Today's Mission as the hero.

### A2. Learner sees Today's Mission

- **Entry point**: Home, immediately after A1.
- **User actions**: reads the mission card; no action required to "see" it.
- **System actions**: mission card renders today's finite daily plan — one
  article slot, one podcast slot, each its own top-ranked recommendation
  (title, estimated time, why-now framing kept soft — "Perfect for your
  goal," not a visible score) and its own completion checkmark once done.
- **Tuto interactions**: the mission is framed as coming from Tuto ("Tuto
  picked this for you today"), not from "the system."
- **Exit state**: learner either starts either slot (A3), or navigates away
  to Explore/Progress/Profile without starting anything — a valid, non-error
  exit state. Both slots persist unchanged if they return later the same
  day.

### A3. Learner starts today's mission

- **Entry point**: tap/click on the Today's Mission card.
- **User actions**: taps "Continue"/"Start."
- **System actions**: opens the content detail/player for that item; creates
  or resumes a `progress` row (`content_item_id`, `user_id`, `status =
  in_progress`, position = 0 if new).
- **Tuto interactions**: a light send-off moment is acceptable (e.g. Tuto
  waving as the player opens) — not required on every launch, more relevant
  the first time a learner does this post-onboarding.
- **Exit state**: learner is inside the content player, mission marked
  in-progress on Home if they back out without finishing.

### A4. Learner resumes unfinished content

- **Entry point**: Home (if the unfinished item *is* today's mission — see
  Content Lifecycle §"how unfinished content behaves" for why unfinished
  work takes priority over a fresh pick) or Progress/Explore (if the learner
  navigates to it directly).
- **User actions**: taps "Resume."
- **System actions**: reopens the player at the last saved position.
- **Tuto interactions**: a short acknowledgment of return is appropriate
  ("Right where you left off") — informational, not celebratory.
- **Exit state**: back in the player, same as A3.

### A5. Learner completes a piece of content (e.g. a podcast)

- **Entry point**: content player, learner reaches the end (or explicitly
  marks complete, for content types without a natural "end," e.g. a future
  article).
- **User actions**: none required beyond finishing — completion should be
  automatic on reaching 100%, not a manual "mark as done" click for content
  with a natural end point.
- **System actions**: `progress.status = completed`; timestamp recorded;
  `total_minutes`/streak fields updated; Learning Brain's freshness signal
  for this item updates immediately (see `content-lifecycle.md`).
- **Tuto interactions**: a completion moment — short, celebratory, specific
  to what was just finished ("Nice! You just finished '{title}'"), not a
  generic toast.
- **Exit state**: returns to a completion summary (see A6 if this was the
  Today's Mission) or back to wherever the learner opened it from (Explore,
  Progress) if it wasn't the day's guided pick.

### A6. Learner finishes Today's Mission specifically

- **Entry point**: A5, where the completed item was one of today's two
  mission slots (article or podcast).
- **User actions**: none beyond A5's completion.
- **System actions**: marks that slot complete (checkmark, never
  re-assigned for the rest of the day — see Learning Brain philosophy on
  same-day behavior below); updates streak (increments if this is the
  first mission-completion of the calendar day, regardless of which slot);
  awards XP (see A7).
- **Tuto interactions**: finishing either slot gets a short celebratory
  acknowledgment; finishing the *second* slot (completing the full daily
  plan) is the single biggest celebratory moment in the product — Tuto's
  most expressive pose/animation, tied to the streak if relevant ("3 days
  in a row!").
- **Exit state**: back to Home. If one slot remains, the mission card shows
  the updated checklist (one done, one still to go) — not a new item in its
  place. If both slots are now done, the card switches to a "Today's
  Mission Completed" state with a countdown to tomorrow, for the rest of
  that calendar day.

### A7. Learner receives XP

- **Entry point**: any completion event (A5/A6), not exclusively the daily
  mission — finishing anything awards something, but the *mission* completion
  is weighted as the meaningful moment.
- **User actions**: none — this is a system reward, not a request.
- **System actions**: XP added to profile; level-up check (existing
  `xp`/`xp_to_next` fields in `profiles`); if a level threshold is crossed,
  trigger a level-up moment.
- **Tuto interactions**: XP gain itself is a quiet, small visual (not a full
  interruption) unless it triggers a level-up, which is a full Tuto moment
  similar in weight to A6.
- **Exit state**: back to whatever screen triggered it, with the updated XP
  reflected on next Progress-tab visit.

### A8. Learner receives a message from Tuto (proactive, not completion-tied)

- **Entry point**: any Home load (A1) or, in the future, a push
  notification opened from outside the app.
- **User actions**: reads/dismisses.
- **System actions**: selects the appropriate note variant from a small,
  prioritized set (streak-risk warning > milestone celebration > gentle
  re-engagement > general encouragement) — never stacks more than one.
- **Tuto interactions**: this *is* the Tuto interaction — see the dedicated
  "Where Tuto Participates" table at the end of this document for the full
  variant list.
- **Exit state**: no state change by itself; it's a layer on top of A1.

---

## B. Exploration & Discovery

### B9. Learner explores additional content beyond the mission

- **Entry point**: Explore tab, tapped deliberately (never auto-opened).
- **User actions**: browses content-type chips, scrolls the Tuto
  Recommends strip or the full list, optionally applies filters.
- **System actions**: loads the broader recommendation slice (beyond the
  single Home pick) plus the full catalog for the active content type.
- **Tuto interactions**: the Tuto Recommends strip is still framed as his
  picks; the full list below it is neutral (still relevance-sorted by
  default, but not narrated).
- **Exit state**: either opens a content item (converges with A3's player
  flow, `progress` row created same way regardless of entry point) or
  leaves Explore without starting anything — fully valid.

### B10. Learner searches for content

- **Entry point**: search affordance inside Explore.
- **User actions**: types a query.
- **System actions**: queries the universal content table across all types;
  if results are thin or the query matches a Coming Soon content type,
  responds accordingly (see B-edge-1).
- **Tuto interactions**: empty/thin results are voiced by Tuto, not a bare
  "no results" — see Content Lifecycle for exact framing.
- **Exit state**: result list within Explore, or opens an item (same as
  B9's exit).

### B11. Learner saves content for later (bookmark)

- **Entry point**: content detail view or a list item's save affordance,
  reachable from Explore or the player.
- **User actions**: taps save/bookmark.
- **System actions**: writes to `bookmarks` (existing table, generalizes to
  `content_item_id` the same way `progress` does).
- **Tuto interactions**: minimal — a small confirmation, not a celebration;
  this is a utility action, not a milestone.
- **Exit state**: same screen, item now marked saved; saved items surface in
  Profile or a "Saved" filter within Explore (placement is a design
  decision, not fixed here).

---

## C. Progress & Momentum

### C12. Learner opens Progress

- **Entry point**: Progress tab.
- **User actions**: views streak, recent activity, level, achievements.
- **System actions**: aggregates `profiles` fields (streak, xp, level,
  total_minutes) and recent `progress`/`achievements` rows into a narrative
  view, not a stats table (per `docs/design-system.md`).
- **Tuto interactions**: light framing throughout ("You've studied 4 days
  this week"), not just raw numbers.
- **Exit state**: stays on Progress until the learner navigates elsewhere;
  no action is required here, it's a reflection surface.

### C13. Learner returns the next day

- **Entry point**: app open on a new calendar day relative to
  `last_study_date`.
- **User actions**: same as A1.
- **System actions**: Learning Brain computes a **new** Today's Mission for
  the new day (see Learning Brain philosophy below for exactly what carries
  over); streak-continuation check runs (did yesterday have a completed
  mission?).
- **Tuto interactions**: return-specific greeting variant if yesterday was
  completed ("Ready for day {n}?") vs. if it wasn't (gentle, non-guilt-based
  nudge, not a scolding).
- **Exit state**: Home, new mission.

### C14. Learner loses a streak

- **Entry point**: app open where the gap since `last_study_date` exceeds
  the streak-continuation window (missed a full day).
- **User actions**: none — this is detected on load, not user-triggered.
- **System actions**: streak resets to 0 (or to 1 if they complete something
  today); this is recorded, not hidden.
- **Tuto interactions**: this is the single most important tone moment in
  the entire flow set — **never punitive, never guilt-inducing**. Tuto
  acknowledges it plainly and immediately pivots to restarting momentum
  ("Life happens — let's start a new streak today"), never "you broke your
  streak" framing, never a sad/disappointed Tuto pose.
- **Exit state**: Home, with a normal (not diminished) Today's Mission —
  the product should make restarting feel exactly as easy as continuing,
  not like climbing back from a setback.

### C15. Learner restores momentum after a streak loss

- **Entry point**: C14's exit state, learner completes a mission that day.
- **User actions**: completes Today's Mission (same mechanics as A6).
- **System actions**: new streak begins at 1.
- **Tuto interactions**: an encouraging, forward-looking completion message
  distinct from a milestone celebration — this is a "welcome back" moment,
  not treated identically to a 7-day streak.
- **Exit state**: same as A6.

### C16. Learner reaches a weekly goal

- **Entry point**: a completion event (A5/A6) that crosses a
  weekly-minutes or weekly-missions threshold derived from
  `daily_time_minutes` × 7 (or missions/week).
- **User actions**: none beyond the triggering completion.
- **System actions**: detects the threshold crossing, triggers a
  weekly-specific celebration (distinct from the daily one in A6 — bigger,
  less frequent, reinforces the plan set during onboarding/`/ai-plan`).
- **Tuto interactions**: ties explicitly back to the plan Tuto set up at
  onboarding ("You hit your weekly goal — exactly what we planned!"),
  connecting Dashboard behavior back to the onboarding promise.
- **Exit state**: brief celebration, then Progress or Home, learner's
  choice.

---

## D. Edge Cases

### D-edge-1. Learner taps a Coming Soon content type

- **Entry point**: Explore, tapping an inactive chip (Articles, Videos,
  etc.).
- **User actions**: taps the chip.
- **System actions**: renders the Coming Soon state — no content list, no
  dead link.
- **Tuto interactions**: a short, specific, in-voice message ("Tuto's
  working on this one — Podcasts are ready now though"), redirecting
  attention to what *is* available rather than leaving a dead end.
- **Exit state**: stays in Explore, learner naturally redirected back to
  Podcasts.

### D-edge-2. Content pool temporarily exhausted for a learner's profile

- **Entry point**: Learning Brain has no strong-match candidate left
  (realistic today at 13 podcasts for a narrow level+interest combination).
- **User actions**: none — detected during recommendation computation.
- **System actions**: relaxes match strictness in a defined order (topic
  match first, then level range, never dropping goal alignment) rather than
  showing nothing; this is a scoring fallback, not a broken state.
- **Tuto interactions**: if even the relaxed match is thin, Tuto says so
  honestly ("You've explored a lot of what fits you best — here's something
  a little outside your usual pick") rather than silently serving a bad
  match with no explanation.
- **Exit state**: Home still shows a mission — the product never shows an
  empty Today's Mission.

### D-edge-3. Brand-new learner, first Dashboard visit ever

- **Entry point**: immediately after `/ai-plan` → `/dashboard`, zero
  history.
- **User actions**: none yet.
- **System actions**: first-ever Today's Mission computed purely from the
  onboarding profile (no engagement history exists yet); no streak, no
  Tuto's-note history to draw on.
- **Tuto interactions**: a distinct first-visit welcome, different from the
  A1 returning-learner greeting — explicitly bridges from the `/ai-plan`
  reveal screen's promise ("Here's the first step in the plan we just
  built").
- **Exit state**: Home, functioning identically to any other day from this
  point forward.

---

## Where Tuto Participates (summary across all flows)

| Moment | Tuto's role |
|---|---|
| App open | Greeting, optional contextual note |
| Today's Mission | Framed as his pick, not "the system's" |
| Starting content | Light send-off (optional) |
| Resuming content | Brief acknowledgment |
| Completing any content | Specific, short celebration |
| Completing Today's Mission | The biggest celebratory moment in the product |
| XP gain | Quiet unless it's a level-up |
| Streak milestone | Celebration |
| Streak loss | Non-punitive, immediately forward-looking |
| Weekly goal | Ties back to the onboarding plan |
| Explore recommendations | "Tuto Recommends," never "AI" |
| Search empty/thin results | Honest, in-voice, redirecting |
| Coming Soon tap | Redirects to what's live |
| Content pool exhausted | Honest about relaxed matching |
| First-ever Dashboard visit | Distinct welcome bridging from onboarding |

Tuto is never silent at a moment that matters, and never louder than the
moment deserves — quiet acknowledgments stay quiet, and the two biggest
moments in the whole product (finishing Today's Mission, and recovering
from a lost streak) get his fullest expression.
