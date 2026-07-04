# Scene 1 — "First Light"
## A design review and complete reconception of the first meeting with Tuto

**Status:** Approved with Founder Overrides (v1.1) — implemented.
**Scope:** Scene 1 only. The Engineering Specification, state machine, adaptive engine, Learning Brain, and the scene's `mount(ctx)` / `ctx.onReady()` contract are untouched by everything in this document.

> ### Founder Overrides (v1.1) — these amend everything below
> 1. **No dark visual identity.** State I is not darkness: it is the app's own warm cream world dimmed to a golden dusk (a honey veil), so the arc is *hushed → vivid*, never *black → light*. Every reference to "dark"/"darkness" below reads as this warm veil.
> 2. **Sound is optional.** The wake tone is a grace note behind capability checks; the scene is complete and equally magical muted.
> 3. **Haptics are progressive enhancement only** — a `navigator.vibrate` probe, never a dependency, never a plugin requirement.
> 4. **Full input parity.** The ember and the orb are real buttons (mouse/touch/keyboard/AT all get native activation); Enter/Space anywhere on the veil wakes; any input advances the exchange; focus is managed ember → orb; reduced-motion and screen-reader paths are first-class.
> 5. **Once in a lifetime.** The scene never repeats after onboarding. It remains stateless; the caller records completion (Learning Brain / profile layer per the Engineering Specification) and simply never mounts it again — including across guest→account migration.

---

## Part I — The honest autopsy

### 1. Brutal critique of the current Scene 1

The current scene is well-built and emotionally hollow. Three passes of polish have made it a *very good version of the wrong thing*. Its failures, named:

**The Screensaver Problem.** The scene performs identically whether or not anyone is watching. Tuto breathes on a loop, the aura pulses on a loop, the particles rise on a loop, the lines land on a fixed schedule. Nothing — not one pixel — is contingent on the user. Contingency is how humans detect life. A creature that reacts to you 100ms after you act feels alive; a creature that loops feels like a GIF. Right now Tuto is a GIF with good production values.

**The Spectator Problem.** For 7.25 seconds, the user's job is to watch. Their single act — tapping a button at the end — is the least expressive interaction in all of software. First meetings are memorable because of *mutual* action: eye contact, a handshake, being noticed. We built a screen that talks at people and calls it a conversation.

**The Chat Ghost.** We removed the bubbles and kept chat's grammar. The three bouncing typing dots are the single most chat-coded artifact in existence — they say Slack, iMessage, support widget. As long as Tuto "types," Tuto is a chatbot wearing a nice costume.

**The Caption Problem.** Tuto is up there; the words are down here. Nothing connects them — no spatial link, no causal link, no breath. The words don't come *from* Tuto; they appear *near* Tuto, like captions under a photograph. A slideshow with a mascot watermark.

**The Kiosk Greeting.** "Hi. I'm Tuto." — to whom? We collected the learner's name at the welcome screen and Scene 1 doesn't use it. A mentor who doesn't know your name after you've introduced yourself isn't a mentor; it's a kiosk.

**The Bathroom Lighting.** The scene is evenly, warmly, flatly lit from the first frame to the last. Screenshot t=0 and t=7250 and the light is essentially identical. No darkness, no dawn, no arc of illumination — and therefore no drama. Cinema's oldest tool is the cheapest one we own, and we're not using it.

**The Form Button.** The threshold of the entire relationship — the moment the learner commits — is a pill-shaped button that says "I'm ready." It answers a question nobody asked, in the visual language of a checkout flow.

**The Silent Film.** No sound. The most emotional sense we have access to is unused. (There's a real reason: browsers block audio before a user gesture. Note that this is an argument *for* an interaction-first scene, not against sound.)

### 2. Why it fails emotionally

All eight failures are one failure: **the user is an audience, and audiences don't bond.** Every emotional goal in the brief — trust, warmth, connection, wonder — is a property of *relationships*, and relationships require reciprocity. The current scene has a performer and a viewer. Polishing the performance more (bigger aura, more particles, better easing) raises production value without touching the category error. That is why three passes have improved it and none has produced a "wow."

### 3. What people subconsciously feel right now

- "This is a nicely animated loading screen."
- "When can I skip this?" (the fixed timeline creates skip-instinct within ~2 seconds — the same reflex trained by unskippable ads)
- "Cute mascot." — *cute* is the consolation prize of character design. We're aiming for *presence*, and cute-but-inert reads as toy, not mentor.
- Taps during the sequence do nothing → "this is a video, not a thing."
- The pulse ring and particles register as decoration — felt as *effort*, not as *meaning*. Users can smell the difference between motion that means something and motion that fills space.

### 4. What an unforgettable first impression should feel like

Not "impressive." **Reciprocal.** The user should walk away with the feeling *"it noticed me — and I made something happen."* The memory that survives is never the gradient; it's the moment of agency plus the moment of being seen. Unboxing an Apple product is choreographed so that *your hands* do the reveal. The lid resists slightly; you lift it; the device is presented *to you, by you*. Nobody remembers watching a box open itself.

So the test for the new Scene 1 is one sentence:

> **You don't meet Tuto. You wake him.**

---

## Part II — The new scene: "First Light"

### 5. The concept

The screen is dark — the only dark screen in the entire product, ever. One small ember of warm light breathes in the darkness. A whisper of text: *touch the light*.

The user touches it. **That touch is the big bang of the whole product:** light blooms outward from their fingertip, darkness rolls back like a time-lapse sunrise centered on *their* point of contact, and Tuto condenses out of the light — arriving because the user called him. Tuto looks at where they touched. Then looks at them. Blinks. And says their name.

A short exchange — three lines, each one breathed rather than typed. Then Tuto's aura sheds a small orb of that same first light. It drifts down into the thumb zone and waits. *Begin.* The user takes the light — and carries it into Scene 2.

The gesture vocabulary of the product in one arc: **the user gives Tuto light; Tuto gives it back.** The light the user takes at the end of Scene 1 is the visual thread that will run through the whole Discovery Session and, eventually, become the reveal ceremony. Scene 1 stops being an intro and becomes the origin story of an object the user owns.

And it happens **once**. Scene 1 never replays. Like a hand-written inscription inside a book cover — its unrepeatability is what makes it precious.

### 6. Visual composition

Three lighting states, in order — this is the composition:

**State I — Dark (user-paced, before touch).**
Full-bleed warm near-black `#171310` (espresso, not tech-black — dark must feel like a room at night, not an OLED). Composition is one ember at exact center: a 10px core of `#FF6B35` inside a 48px soft bloom, breathing on a 4.8s sinusoid. After 2.4s (one half-breath — the delay matters; instant text kills the mystery), a whisper appears 88px below: `touch the light` — 13px, lowercase, 0.12em tracking, 40% warm-white. Nothing else. No logo, no brand, no skip. Two values on screen: darkness and one light. The palette is being *held back* so the bloom can spend it all at once.

**State II — Bloom (T0 → T0+1.4s).**
Radial wipe from darkness to the app's warm cream world, centered on the user's actual touch coordinates — every user's sunrise is geometrically their own. Tuto condenses inside the bloom and lands at the top-third anchor (the current anchor geometry survives — it was correct).

**State III — Day (T0+1.4s onward).**
The existing warm world: cream field, soft core wash behind Tuto, floor glow, edge vignette. Dialogue set at 30px display type at Tuto's chest level — close enough to the face to read as *spoken*, not captioned. The one persistent motion is breath: Tuto, aura, and the text's faint warm glow (`0 0 24px rgba(255,150,90,0.35)`) all phase-locked to the same 4.8s rhythm. Lines land on the exhale.

### 7. Motion language

Name it and enforce it: **"Everything breathes. Nothing bounces."**

1. All idle motion is sinusoidal breath, period 4.8s or a harmonic of it. One rhythm, everywhere, phase-locked.
2. Entrances are **condensation**: blur 12→0, scale 0.92→1, opacity 0→1 — things form out of light. Never slides, never pops.
3. Exits are **dissolution**: outgoing lines break into 5–7 faint motes that drift upward and join the atmosphere. The conversation literally becomes the air of the room. Never fade-to-nothing, never slide-away.
4. Response to any touch lands in **under 100ms** — always. Aliveness is latency.
5. One spring in the whole scene: Tuto's landing settle (damping ≈ 0.8, two gentle overshoot frames). Cartoon bounce is banned.
6. `prefers-reduced-motion`: the bloom becomes a 400ms crossfade, particles become static faint glints, condensation becomes plain fades. The scene's meaning survives with its motion removed — that's the test of whether the motion was meaning or decoration.

### 8. Typography hierarchy

| Role | Spec | Why |
|---|---|---|
| The whisper | 13px / lowercase / 0.12em tracking / 40% opacity | A held breath. The smallest voice on screen invites the biggest act. |
| Tuto's lines | 30px / 700 / −0.015em / 1.25 / `--font-display`, faint warm text-glow | The only large type in the scene. Scale contrast *is* the hierarchy. |
| Receding line (during exchange) | dissolves — see §7.3 | History in this scene is atmosphere, not a list. *(Flag: see Part IV.)* |
| "Begin" | 14px small caps / 0.08em, appears 800ms after the orb settles | Curiosity first, clarity just after. Never simultaneous. |

Total spoken words in the scene: **under 20.** The current final line (13 words) is the ceiling for one line, and we now use it once, not as a pattern.

### 9. Lighting strategy

Light is the protagonist's costar — it must always be *causal*, never decorative:

- Darkness exists so the user can end it. The bloom is centered on their fingertip: **the user is the sunrise.**
- Tuto's aura is no longer ambient glow; it is *the light the user gave him*. It dims ~10% when he "thinks" and swells when a line lands — he breathes the light.
- The orb at the end is a piece of that aura being *given back*. Same hue, same breath rhythm, small enough to sit under a thumb.
- Dark→Day happens exactly once in the product's life. Every other screen lives in Day. The once-ness is the luxury.
- System chrome participates: `theme-color` / status-bar swaps dark→light with the bloom, so even the phone's frame is part of the dawn.

### 10. Color strategy

- **State I:** exactly two values — `#171310` and ember-orange. Scarcity.
- **The bloom** spends the full brand palette in 580ms. Abundance, purchased by the preceding scarcity.
- **State III:** the existing warm cream world, unchanged — Scene 1 must land the user in the *same* world the rest of the app lives in, or the magic reads as a trailer for a product that doesn't exist.
- Brand orange `#FF6B35` is used **only as light** in this scene (ember, aura, orb, text-glow, CTA-orb). Never as flat fill. Orange = energy given and received.

### 11. Animation timeline (T0 = the user's touch)

| Time | Event | Duration / easing |
|---|---|---|
| T−∞ | Ember breathing at center, 4.8s sinusoid | loop |
| T−∞ +2.4s | Whisper fades in | 600ms ease-out |
| idle 12s+ | Ember brightens 8%, drifts ±6px — a glint, not a nag | once per 12s |
| **T0** | Ember flares 1.15× — same frame as the touch | ≤16ms (1 frame) |
| T0 | Haptic: single soft tap (Capacitor) · Audio: warm ~220Hz tone, quiet, 900ms decay — the product's first sound, unlocked legitimately by the gesture | — |
| T0+0–120ms | Fine light ring ripples out from the fingertip | 120ms ease-out |
| T0+120–700ms | Radial dark→day wipe centered on touch point | 580ms `cubic-bezier(0.22,1,0.36,1)` |
| T0+400–1050ms | Particles converge; Tuto condenses (blur 12→0, scale 0.92→1); settle spring | 650ms |
| T0+1050–1400ms | **Stillness.** Breathing only. Nothing else happens. | 350ms — the most expensive pause in the product |
| T0+1400ms | Tuto's gaze shifts to the touch point → then to center → one slow blink | 240 + 200 + 140ms |
| T0+1900ms | Line 1 condenses at chest level: **"Oh— hello, Yodgor."** (no name: "Oh— hello.") | 420ms |
| +≈2600ms | Line 1 dissolves to motes; line 2 condenses: **"I'm Tuto."** | 600 + 420ms |
| +≈4200ms | Line 3: **"From here on, it's you and me."** | same |
| +≈6000ms | Line dissolves; Tuto's aura sheds the orb; it descends a shallow arc into the thumb zone, light-trail decaying behind it | 900ms descent, 400ms trail decay |
| +≈6800ms | `BEGIN` fades in beside the orb | 300ms |
| user touch on orb | Orb absorbs toward the fingertip, then slides toward Scene 2 as the transition itself — `ctx.onReady()` fires here | 450ms |

The "Oh—" in line 1 is load-bearing. Perfection reads as scripted; the tiny catch of surprise reads as *he was actually waiting.*

Timing note: everything before T0 is user-paced (they own the first beat), everything after line 1 advances on a gentle schedule **but any touch advances to the next beat immediately** — impatience is obeyed, never punished.

### 12. Emotional timeline

| Beat | Feeling engineered |
|---|---|
| Darkness + ember | Curiosity. A question, not a statement. |
| The whisper | Invitation. The product speaks quietly first — confidence. |
| The touch | **Agency.** "I did that." |
| The bloom | Wonder. Scarcity → abundance in half a second. |
| The stillness + gaze | **Being seen.** He looks where you touched. He knows you did it. |
| Your name | Trust. He knew who was coming. |
| "It's you and me." | Warmth, belonging. |
| The orb descends | Reciprocity. You gave light; light is returned. |
| Taking it | Commitment — chosen, not clicked. |

### 13. Interaction philosophy

- **The user acts first.** The product's opening move is to wait, beautifully.
- **Respond in under 100ms, always.** Every touch gets an answer: taps during the bloom make Tuto's gaze flick to each tap point — impatience becomes play, and the "is this a video?" test returns *no, it's alive*.
- **Silence is a feature.** After the greeting, if the user does nothing for 20s, Tuto blinks slower. He does not repeat himself. He does not nag. Patience is how confidence looks.
- **Never autoplay past a threshold.** The scene begins on a touch and ends on a touch. Everything in between may flow; the doors are the user's.
- **Explicit confirmation stays** (Founder Decision 5): the orb is a tap, richer-dressed. Nothing auto-advances across the scene boundary.

### 14. Removed

- The three typing dots (chat's ghost). "Thinking" moves into the character: eyes glance up, body stills, aura dims 10%.
- The pill button. Replaced by the orb + `BEGIN`.
- The fixed autoplay monologue. Replaced by touch-to-begin, touch-to-advance, touch-to-commit.
- The stacked line history *in this scene* — replaced by dissolution into motes *(explicit founder flag: Part IV)*.
- The decorative pulse ring — superseded by the causal aura (light that was *given*, dimming and swelling with thought and speech).
- The current opening: any version of the scene where the first frame already shows Tuto. His arrival is the scene.

### 15. Added

- The dark State I, the ember, the whisper, the touch-centered bloom.
- Gaze: Tuto's eyes track the last touch point for the first 10s, then rest at center. (New SVG eye states: gaze-left/right/up, blink — a small set of variants of the existing `getTutoSVG`.)
- The product's first sound, and a soft haptic, both unlocked by the wake gesture.
- The orb handoff, and the light-as-continuity thread it establishes for Scene 2+ and, eventually, the result ceremony.
- Name-aware greeting from existing profile data.
- A written VoiceOver experience, not a fallback: *"Tuto is waiting in the dark. Double-tap to say hello."* → the scene narrates its beats. Screen-reader users get a story, not silence.

### 16. Details nobody notices and everybody feels

- Touch anywhere in the dark and the ember **drifts to meet your finger** before blooming — it *comes to you*.
- The bloom's center is your actual touch coordinates. No two users see the same dawn.
- Aura, body, and text-glow breathe phase-locked; lines land on the exhale.
- The wake-tone's pitch varies ±3 cents per install — no two phones chime identically.
- On desktop, the ember leans a few pixels toward the cursor.
- `theme-color` swaps with the bloom — the browser chrome itself goes dark→day.
- Tuto's blink rate slows when the user idles: calm, not impatience.
- The scene never replays. Ever.

---

## Part III — Award-jury critique of this proposal (attacking my own design)

**"A dark first screen will read as broken."** Mitigated: the ember renders within 300ms of mount and is already breathing; the whisper lands at 2.4s; at 12s idle the ember glints and drifts. Three escalating invitations, none of them a nag.

**"Touch-to-wake is undiscoverable for some users."** The whisper is explicit instruction. Full-screen hit target — any touch works, the light comes to the finger. Long-idle glint. And the VoiceOver script instructs directly.

**"Does it survive the 100th launch?"** It never has a 100th launch. Once-ness is the design.

**"WebView performance on low-end Android?"** No WebGL required: radial-gradient wipe (compositor-friendly `opacity`/`transform`/`clip-path`), ≤12 canvas particles, one blur filter. Must be profiled on the Capacitor debug build before sign-off — this is a hard QA gate, not a hope.

**"The 'Oh—' could read as twee."** It's one em-dash from failure, agreed. The fallback is the plain "Hello, Yodgor." A/B the greeting copy; keep the gaze-then-blink either way — the recognition beat carries even if the copy is straightened.

**"Sound on first launch is risky."** It's quiet (-24 LUFS territory), warm, 900ms, and gesture-gated — the polite kind. Muted devices simply get the haptic. Never blocked on it.

### 17. Why this could stand at an Apple Design Award level

Because it has the one property winners share: **a single idea executed all the way down.** The idea — *light exchanged between user and mentor* — decides the first frame (darkness), the interaction (touch to give light), the character animation (he breathes the light you gave him), the typography (words made of light), the exit (light returned), and the product's future visual thread (the orb travels the whole session). Nothing on screen is outside the idea. That's what "every pixel has purpose" cashes out to.

### 18. The shareable moment

People record what has a beginning, a middle, and a payoff inside four seconds — and what survives being watched **muted** (most shared screen-recordings are). The wake sequence is exactly that: dark screen → fingertip → sunrise from the finger → a creature condenses and *looks at you*. Fully legible with no sound, vertical, under 5 seconds. Secondary shareables: the name greeting ("it knew my name" is the caption that writes itself) and the orb handoff.

---

## Part IV — Honest flags before implementation

1. **Founder Decision 4 (bubble history stays visible)** — this design dissolves prior lines into motes instead of stacking them, *in this scene only*. The decision text says history remains "whenever it improves conversation continuity"; with three lines totaling ~15 words, stacking adds nothing and dilutes the single-focal-point composition. **I am treating this as within the rule's spirit but it needs your explicit sign-off.**
2. **New Tuto SVG states** (gaze ×3, blink, still/thinking) — additive variants of the existing inline SVG. No dependency on the demo mascot system.
3. **Sound + haptics** are enhancements behind capability checks (gesture-unlocked audio; Capacitor haptics). The scene is complete without them.
4. **Engineering contract unchanged:** same `mount(ctx)` / `ctx.onReady()`, same scene descriptor, no state-machine or flow changes. Everything here is the experience layer.
5. **Hard QA gates:** low-end Android WebView at 60fps; `prefers-reduced-motion` path; VoiceOver path; guest (no-name) greeting.

---

**Awaiting approval. On sign-off, implementation order: State I + bloom → condensation + gaze → exchange + dissolution → orb handoff → sound/haptics → reduced-motion & VoiceOver passes → device QA.**
