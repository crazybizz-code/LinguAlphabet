# Adaptive Assessment — Conversation Experience Specification (Revision 2)

**Status:** Draft for approval — do not implement until signed off.
**Scope:** Experience layer only. This document redesigns *how the assessment feels*, not *how it works*.

## 0. What this revision does and does not touch

**Unchanged (frozen, approved engineering):**
- The checkpoint staircase adaptive algorithm
- Stopping criteria
- Confidence calculation
- The assessment state machine (states and transitions)
- Engineering architecture (services, data flow, storage)
- Learning Brain integration

**Redesigned (this document):**
- Everything the learner sees, reads, waits for, and feels between the moment the assessment starts and the moment their level is revealed.

The engineering spec defines *when* something happens (a state transition fires, a checkpoint is reached, confidence crosses a threshold, the stop condition is met). This document defines *what Tuto says and does* at each of those existing moments. No new states, no new transitions, no new triggers are introduced — every beat below binds to a hook that already exists in the approved state machine.

---

## 1. Core reframe: Question Engine → Conversation Engine

The learner should never feel evaluated by a system. They should feel like they're **catching up with Tuto**, who is naturally curious about where they're at.

Reframe the entire surface vocabulary:

| Old (Question Engine) | New (Conversation Engine) |
|---|---|
| "Question 4 of 12" | *(no counter shown — see §3)* |
| "Submit answer" | "Tell Tuto" / implicit on selection |
| "Correct" / "Incorrect" | Tuto reacts in character; correctness is never stated flatly |
| "Assessment complete" | "Tuto's made up their mind." |
| "Your level is B1" | A reveal moment (§8), not a label drop |
| Progress bar | A felt sense of momentum, not a mechanical readout (§3) |

Tuto is not administering a test. Tuto is *figuring the learner out*, out loud, in real time.

---

## 2. Tuto's voice during assessment: a distinct mode

Tuto already has a personality elsewhere in the product. During assessment, that personality narrows into a specific **mode**: attentive, warm, lightly playful, quietly impressed or quietly recalibrating — never clinical, never a game-show host.

**Dynamic personality rules:**
- Tuto's tone shifts subtly with the staircase direction, without ever naming the mechanism:
  - Climbing (learner answering above expectation): Tuto gets a *little* more animated, more clipped, faster energy — like someone leaning forward.
  - Descending (learner struggling): Tuto slows down, softens, never sounds disappointed — sounds *more interested*, like it just found the interesting part.
  - Stabilizing (confidence converging): Tuto gets calmer and more declarative, fewer questions in its own voice, more statements — it's starting to *know*.
- Tuto never says "easier" or "harder." It never breaks the fourth wall about difficulty, scoring, or the algorithm.
- Tuto's remarks are short. This is a conversation, not a monologue — one line, maybe two, never a paragraph.

**Line bank examples (tone reference, not final copy):**
- Climbing: "Oh, okay." / "You weren't kidding." / "Alright then."
- Descending: "Ah — let's slow down here." / "That's alright, this one's a curveball." / "Good, this tells me something."
- Stabilizing: "I think I see it." / "Mm. Makes sense." / "That tracks."

These lines are *observations*, delivered between items — never a judgment on the item the learner just completed. Tuto reacts to the *pattern*, not the *score*.

---

## 3. Conversational pacing (replacing the progress bar)

No numeric progress bar and no "Question X of Y." A staircase-style test whose length is dynamic *cannot* honestly show a fixed-count progress bar anyway — showing one would be lying to the learner about how adaptive testing works. Replace it with:

- **A momentum indicator**, not a counter: a subtle, ambient visual (e.g. a soft glow trail or breathing dot) that communicates "we're moving forward" without quantifying "how much is left."
- **Tuto occasionally signals scope without numbers**: "A few more of these and I'll have it." / "Almost there." These lines are tied to the *existing* confidence/stopping-criteria signal — when the engine is close to its stop condition, Tuto is allowed to sound like it's close, without exposing the mechanism or a fake ETA.
- Pacing is not uniform. Time-on-item is allowed to breathe — see §5 (Silent Moments) — rather than snapping instantly from one item to the next.

Binding: this reads the existing confidence/stopping-criteria signal to decide *when* Tuto is permitted to say an "almost there" line. It does not change what that signal computes or when the state machine actually stops.

---

## 4. Transitions between questions

The transition between items is where "test" most often leaks through as a feeling. Redesign it as a **conversational beat**, not a screen wipe:

1. Learner responds.
2. **Beat 1 — Acknowledgment** (0.3–0.6s): a small, immediate reaction — never evaluative, just present. A nod-equivalent. No verdict yet.
3. **Beat 2 — Tuto's observation** (optional, not every item — see §6 for cadence): one short line, per §2's tone rules.
4. **Beat 3 — Bridge into the next item**: Tuto doesn't just present the next question cold. It hands it off conversationally — "here's one," "try this," "okay, new one" — varied, never templated to feel like a "Next" button in disguise.
5. Next item appears.

No item should feel like it "loaded." It should feel like it was *offered*.

Binding: Beats 1–3 all occur inside the existing "item presented → response captured → next item selected" transition already defined by the state machine. This spec only fills that existing transition with conversational content; it does not add a state or delay the staircase's actual item-selection logic.

---

## 5. Silent moments

Not every beat needs a line. Constant chatter cheapens Tuto and makes the assessment feel like it's performing warmth rather than having it. Deliberately empty space is part of the design:

- After a genuinely hard item, allow a beat of *nothing* — no reaction line, just a slightly longer pause before the next item appears. This reads as Tuto taking the learner seriously, not as latency.
- Not every checkpoint needs an observation. Roughly 1 in 3–4 items gets a Tuto line (§6); the rest transition quietly. Silence between remarks is what makes the remarks land.
- No filler ("Great job!", "Nice work!", "Let's keep going!") is ever used to fill a gap. If Tuto has nothing real to say, it says nothing.

---

## 6. Tuto's observations during the assessment

Observations are Tuto's way of narrating that it's *learning about the learner*, not scoring them.

**Cadence:** roughly every 3rd–4th item (never every item, never on a fixed schedule the learner could detect a pattern in).

**Content categories:**
- **Pattern noticing:** "You're better with this out loud than written, I think." (only ever said if the underlying signal genuinely supports it — these are not decorative; they should feel earned)
- **Light surprise:** "Didn't expect that." — used sparingly, reserved for the staircase's larger jumps.
- **Reassurance without evaluation:** "There's no wrong answer that tells me nothing, by the way." — deployed once, early, to defuse test anxiety before it sets in.
- **Momentum:** "Okay, I've got a shape forming." — used near the point the engine is nearing its stop condition (see §3 binding note).

Observations are about the *learner's pattern across items*, never about a single item's correctness. Tuto should never say "you got that right" or "that was wrong" — that would collapse the conversation back into a test.

Binding: observation cadence and content selection can read existing signals (recent response pattern, staircase direction, distance to stopping criteria) purely to choose *which line* to show. No new computation is introduced — this is presentation logic over already-computed state.

---

## 7. Conversation continuity

The assessment should feel like *one continuous exchange* with Tuto, not a sequence of disconnected cards:

- Tuto references earlier moments lightly: "Like that last one, but trickier." / "Different angle on the same thing." This requires no new engineering — it's copy variation keyed off metadata the engine already has about item relationships (e.g., skill area, checkpoint tier), not new tracking.
- Visual continuity: Tuto's presence (avatar/voice indicator, whatever the existing chrome is) persists on-screen throughout, rather than being reintroduced each item — reinforcing "same conversation," not "new question, new screen."
- No jarring resets. If the learner leaves and resumes (session continuity is already handled by the state machine), Tuto re-enters conversationally — "Okay, where were we." — rather than the UI just snapping back to an item with no acknowledgment of the gap.

---

## 8. Suspense before the final level reveal

This is the single highest-leverage moment in the experience. The engineering event is simple (stop condition met → level computed). The experience around it should be the opposite of simple-feeling — it should feel *earned*.

**Sequence:**
1. **The last item resolves normally** — no special fanfare on the item itself (the learner shouldn't be able to tell in advance which item was "last"; that would let them relax or tense up in a way that skews nothing engineering-wise, but does affect how honest the moment feels).
2. **Tuto goes quiet, visibly "thinking."** A beat longer than any prior pause — 1.5–2.5s — with a distinct, calmer visual state (not a spinner; something that reads as *consideration*, e.g. Tuto's presence dims/stills rather than a loading affordance).
3. **Tuto signals it's arrived at something**, before saying what: a single short line — "Okay. I know where you are." — with a further, shorter pause after it. This is the peak of suspense: confirmation that a conclusion exists, without yet disclosing it.
4. **The reveal itself is Tuto's voice, not a UI label.** The level is delivered as something Tuto is telling the learner, in character, before or alongside any visual level badge/card — e.g. "You're further along than most people think they are. I'd put you at [Level]." The number/label is confirmation of what Tuto just said, not the headline itself.
5. **Premium visual treatment** for the reveal card itself: this is the one moment in the whole flow that's allowed to feel like a "moment" — a distinct visual break from the conversational simplicity used everywhere else (elevated motion, light, whatever the design system's "premium moment" pattern is elsewhere in the product). Contrast is the point: everything before was calm and quiet so this can feel bigger.
6. **Tuto stays in the room after the reveal** — a short follow-up line that turns the result into a forward-looking beat rather than a dead end: "Here's what we're going to work on first." This becomes the bridge into whatever comes after the assessment (already defined by the Learning Brain integration/handoff) — this spec just makes sure Tuto narrates the handoff instead of the screen silently changing.

Binding: step 1 uses the existing stop-condition detection to know *which item is last* (presentation-only — it does not change when the algorithm decides to stop). Steps 2–4 are a presentation sequence layered on the existing "assessment complete → level computed" transition. Step 6 narrates the existing handoff to the Learning Brain; it does not alter what gets handed off or when.

---

## 9. Non-goals / guardrails for implementation

To keep this experience-only, engineering should treat the following as hard constraints when this is built:

- No new state is added to the state machine to support any of the above; every beat above must be expressible as presentation logic bound to an existing transition or signal.
- No timing in this spec may delay, skip, or reorder an actual adaptive decision (item selection, stop condition, confidence update). Pauses are visual/audio only.
- Tuto's copy must never leak the mechanism: no mention of "difficulty," "score," "algorithm," "adaptive," "checkpoint," or numeric progress, anywhere in learner-facing copy during assessment.
- Every Tuto line in §2, §6, and §8 is a content/copy asset, not new logic — they can be authored, reviewed, and swapped without touching the engineering layer at all.

---

## 10. Open items for approval

- Confirm tone reference lines in §2 and §6 are directionally right (final copywriting pass would follow separately).
- Confirm the "no progress bar / no counter" decision in §3 — this is the biggest UI departure from a conventional test and the one most likely to need stakeholder sign-off.
- Confirm the premium reveal treatment in §8 should reuse an existing "premium moment" pattern from elsewhere in the product, or if a new one is warranted (visual-only decision, no engineering impact either way).

**Awaiting approval before implementation.**
