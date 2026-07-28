# Tuto Workspace Architecture

Status: **Phase 1 (Foundation) shipped — General Coach mode only.** Article
Coach, Podcast Coach, and future Checkpoint/IELTS Coach modes are architected
for but not yet built. This document is the reference for both what exists
today and what a future phase adds without redesigning anything below.

## Why this replaced the popup

Tuto's chat used to be a floating popup (`FloatingTuto.tsx`, since removed)
layered on top of every screen, plus separate in-context triggers on Article
(`ReadingStep.tsx`) and, eventually, Podcast. That's now retired in favor of
Tuto as its own primary nav destination (`/tuto`, `docs/dashboard-architecture.md`
§2/§3) — a dedicated AI workspace, not a chatbot bolted onto every screen.

**One reusable component, not three chat systems.** `TutoWorkspace`
(`src/components/tuto-workspace/TutoWorkspace.tsx`) is the single full-page
chat surface behind every mode:

```
General Coach   — /tuto, no lesson in view, the learner can ask anything
Article Coach    — opened via "Discuss with Tuto" on an article (not yet wired)
Podcast Coach    — opened via "Discuss with Tuto" on a podcast (not yet wired)
Checkpoint Coach — future
IELTS Coach      — future
```

Adding a mode is a call-site change (what `context`/`contextBanner` a page
passes in), never a `TutoWorkspace` rewrite — that constraint is why
`mode`/`context`/`contextBanner` are plain props rather than the component
branching internally on route or fetching its own data.

## Component API

```ts
interface TutoWorkspaceProps {
  mode: "general" | "article" | "podcast" | "checkpoint" | "ielts";
  context: TutoContextInput;              // fed straight to useTutoChat — same LearningContext every AI route already uses
  learnerLevel?: CefrLevel | null;         // drives the header's AdaptiveLevelBadge in general mode
  contextBanner?: TutoWorkspaceContextBanner; // omitted in general mode; every other mode supplies one
  emptyState?: TutoWorkspaceEmptyState;
  placeholder?: string;
}
```

`contextBanner` is the compact strip pinned above the conversation for a
scoped mode — "Discussing / Climate Change / BBC Future · B2 · 5 min read /
Change Article" — supplied by the caller, not derived by `TutoWorkspace`
itself. In general mode (no banner), a plain header renders instead (Tuto
avatar + "Tuto" + the learner's level badge) so the page still reads as a
normal primary destination, not a bare chat box.

**A future Article Coach page** (opened from "Discuss with Tuto" on
`/article/[id]`) needs only:

```tsx
<TutoWorkspace
  mode="article"
  context={{ currentScreen: "article", currentArticle: { id, title }, userLevel }}
  contextBanner={{ eyebrow: "Discussing", title, meta: [source, level, `${readingTime} min read`], changeLabel: "Change Article", onChange: ... }}
/>
```

No change to `TutoWorkspace` itself. Podcast Coach is the identical shape
with `currentPodcast`/`transcriptTimestamp` instead — both fields already
exist on `LearningContext` (`src/ai/context/types.ts`), added well before
this phase.

## Chat presentation

- **No fake "Thinking..." copy.** The old `ThinkingTimeline` (cycling
  "Preparing an explanation…"/"Considering the best way…" copy) is kept,
  unmodified, only for the legacy sheet (`TutoChatPanel.tsx`, see
  "Compatibility layer" below). `TutoWorkspace` shows the honest
  `TypingIndicator` (three breathing dots, no invented activity claims)
  until the first token of real content exists, then the reply itself takes
  over.
- **Blinking cursor.** `ChatBubble.tsx` (shared by both the workspace and
  the legacy sheet) now renders a blinking text-cursor after the revealed
  text while a reply is actively streaming — removed once the reveal
  catches up to the final content.
- **Streaming is a felt experience, not literal token-level network
  streaming**, and that's a real, documented constraint
  (`docs/ai-architecture.md`, "Streaming + tools"), not an oversight: once
  the tool loop runs (true for every real request today — six tools are
  always registered), the final answer arrives from the server as one
  complete string, then `useProgressiveReveal` (`src/hooks/useProgressiveReveal.ts`)
  reveals it client-side at a natural reading pace. True token-level
  streaming through the tool-call loop remains real, scoped future backend
  work, not something this phase attempted.
- **Interrupt/regenerate.** `useTutoChat`'s `stop()` and `retryLast()`
  already existed; `TutoWorkspace` is the first surface to expose them as
  visible controls — a Stop button replaces Send while streaming, and a
  Regenerate action appears under a completed reply.

## Contextual quick actions

Requested behavior: quick-action chips must depend on what Tuto actually
just said, never a hardcoded menu. The legacy sheet's chips
(`src/lib/tuto-chat/suggestions.ts`, `ResponseActions.tsx`) are explicitly
hardcoded, frontend-only heuristics by original design — kept exactly as-is
for the compatibility layer, not reused here.

`TutoWorkspace` instead uses model-generated suggestions: the system prompt
(`QUICK_ACTIONS_FORMAT`, `src/ai/prompts/tuto/sections.ts`) instructs Tuto to
append one trailing, machine-readable line to its own reply —
`<!--ACTIONS:["Explain easier","Give an example"]-->` — which
`extractQuickActions()` (`src/ai/services/quick-actions.ts`) strips out
server-side before the reply ever reaches a learner or gets persisted to
Conversation Memory. Safe to parse as one complete string rather than a
streaming-chunk problem, for the same reason real token streaming doesn't
happen today: the tool loop's final answer is already one complete string
before this runs. Malformed or missing lines degrade to zero quick actions,
never a visible parsing artifact or a failed turn.

`streamResponse()`'s generator return value changed shape accordingly —
`{ orchestratorDecision, quickActions }` instead of a bare
`OrchestratorDecision | null` — propagated through the `"done"` SSE event
(`src/app/api/ai/chat/route.ts`) and `useTutoChat`'s new `lastQuickActions`
field.

## Compatibility layer (temporary)

`TutoChatPanel`/`TutoChatSheet` (`src/components/tuto-chat/`) and their
existing entry points — `ReadingStep.tsx`'s "Ask Tuto about this article"
button, `DictionaryOverlay.tsx`'s word-lookup follow-up chat — are
**unchanged and still fully functional**. They stay exactly as they are
until Article Coach and Podcast Coach are built on `TutoWorkspace` and wired
in to replace them. Do not add new features to the legacy sheet path in the
meantime — extend `TutoWorkspace` instead, and migrate the old entry point
when its mode ships.

## What's explicitly deferred, not forgotten

- Article Coach, Podcast Coach, Checkpoint Coach, IELTS Coach modes.
- Migrating `ReadingStep`'s "Ask Tuto about this article" and any future
  podcast "Discuss with Tuto" entry point onto `TutoWorkspace`, and removing
  `TutoChatPanel`/`TutoChatSheet` once nothing depends on them.
- True token-level streaming through the tool-call loop (a backend/provider
  change, independent of this workspace).
- Markdown/syntax highlighting beyond what `renderTutoMarkdown`
  (`src/lib/tuto-chat/markdown.tsx`) already does — deliberately minimal,
  matching `FORMATTING_RULES`'s own instruction that Tuto avoid
  headings/tables/heavy markdown; revisit only if a real reply shape needs
  more (e.g. a fenced code block), not preemptively.
