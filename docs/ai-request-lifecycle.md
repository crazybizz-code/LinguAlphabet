# AI Request Lifecycle — Architecture Review (pre-Phase 2)

Status: **review only — no code changed.** Traces the real, current
request path for "learner asks Tuto a question," end to end through every
layer, against the actual code as of the Phase 1 grounding work
(`docs/ai-coach-audit.md`). Written to answer one question before Memory
gets built: does the current shape of this pipeline have room for Phase 2
(Memory), Phase 3 (Learning Engine), and a future Recommendation System to
plug into cleanly, or will one of them have to fight the existing shape?

---

## The scenario

Learner opens an article, reads a paragraph, and asks Tuto "can you
simplify this?" — the path that exercises every layer, including a real
tool call and a real database read.

## Sequence diagram

```mermaid
sequenceDiagram
    actor L as Learner
    participant UI as UI<br/>(ReadingStep + useTutoChat)
    participant Route as API Route<br/>/api/ai/chat
    participant Service as AI Service<br/>(ai-service.ts)
    participant Loop as Tool Loop<br/>(tool-loop.ts)
    participant Repo as ContentRepository<br/>(src/ai/data)
    participant DB as Supabase
    participant LLM as LLM Provider<br/>(OpenRouter)

    L->>UI: Opens article (ReadingStep mounts, baseContext built)
    L->>UI: "Can you simplify this?" + tap send

    UI->>Route: POST /api/ai/chat { messages, context }
    Route->>Route: Zod validate body
    Route->>Route: buildLearningContext(context)
    Route->>Route: createClient() — cookie-authenticated Supabase client
    Route->>Repo: createContentRepository(supabase)
    Route->>Service: streamResponse({ messages, learningContext, contentRepository })

    Note over Service: PHASE 2 (future) — resolve conversation summary +<br/>LearnerProfile here, BEFORE the prompt is built

    Service->>Service: buildTutoSystemPrompt(learningContext)
    Service->>Loop: runToolLoop(provider, messages, learningContext, { contentRepository })

    Loop->>LLM: complete({ messages, tools: 11 registered tools })  [call 1]
    LLM-->>Loop: toolCalls: [ getArticleParagraphs ]

    Loop->>Repo: executeToolCall → contentRepository.getArticleParagraphs(articleId)
    Repo->>DB: getArticleById(supabase, id) — content_items + article_details
    DB-->>Repo: row data (RLS: authenticated read only)
    Repo-->>Loop: paragraphs: string[]

    Loop->>LLM: complete({ messages + tool result })  [call 2]
    LLM-->>Loop: final answer, no further tool calls

    Loop-->>Service: { completion, toolResults }
    Note over Service: PHASE 3 (future) — async, off the critical path:<br/>observe this turn's signals into ProgressRepository/LearnerRepository
    Note over Service: PHASE 2 (future) — persist updated conversation<br/>summary via ConversationRepository (fire-and-forget)

    Service-->>Route: yields completion.content (single chunk — see note below)
    Route-->>UI: SSE: data: {"type":"delta",...} then {"type":"done"}
    UI-->>L: Tuto's reply renders in the chat bubble
```

**Where Recommendation plugs in:** nowhere in this diagram — and that's
correct, not a gap. The Learning Brain (`src/lib/learning-brain/`) is a
separate request path entirely, triggered by the Dashboard, not by a chat
turn. Its only connection to this flow is that Phase 3 (below) will make
both this chat path and the Learning Brain read/write the **same**
`ProgressRepository`/`LearnerRepository` — the two systems stay decoupled
from each other, coupled only through shared repositories, exactly the
"the Brain should never know where data comes from" model.

---

## What each layer does, briefly

- **UI** — `ReadingStep.tsx`'s `useTutoChat` holds this conversation's
  message array in React state and sends whatever `LearningContext` it
  currently knows (article id/title, selection, level) with every turn.
- **API Route** — the only layer that touches HTTP concerns (Zod
  validation, SSE framing) and the only layer that constructs
  request-scoped infrastructure (the Supabase client, the
  `ContentRepository`) — everything below it works in terms of
  interfaces, never `NextRequest`/`NextResponse`.
- **AI Service** (`ai-service.ts`) — the single entry point every AI
  route calls. Builds the system prompt, decides streaming vs. tool-loop,
  never talks to Supabase itself.
- **Tool Loop** (`tool-loop.ts`) — the only layer that talks to the LLM
  provider directly. Bounded at `MAX_TOOL_ITERATIONS = 4`. Offers every
  registered tool on every call; the model decides what to use.
- **ContentRepository** (`src/ai/data`) — the only layer that knows
  content lives in `content_items`/`article_details`/`podcast_details`.
  Everything above it sees only `AIArticleSummary`, `string[]`
  paragraphs, etc.
- **Supabase** — real Postgres, RLS-gated to authenticated reads.
- **LLM** — OpenRouter, called exactly twice in this example (once to
  decide a tool is needed, once to answer using the tool's result) —
  three or more if the model chains multiple tool calls, bounded by the
  safety valve.

---

## Bottlenecks and future coupling — found before building Memory

Ranked by how much they'd cost to fix *after* Phase 2 lands versus now.

### 1. Three UI entry points will each invent their own "conversation" unless this is decided first — **resolve before writing any Memory code**

`ReadingStep.tsx`, `DictionaryOverlay.tsx`, and `FloatingTuto.tsx` each
call `useTutoChat()` independently today (`docs/ai-coach-audit.md` §11).
Phase 2 needs a `conversationId` to key memory against. If each of the
three call sites is left to invent its own id (e.g. "one per component
mount"), Phase 2 will *technically* add memory while *architecturally*
preserving exactly the fragmentation the audit flagged as the second-worst
problem in the product — three memories instead of zero is not the win it
sounds like. This has to be a UI-layer decision made **before** any
memory-persistence code is written, not discovered afterward: is it one
continuous thread per learner, or scoped-but-linked threads per content
item that still share the durable `LearnerProfile` half? I'd recommend
the former (one thread per learner, contextual metadata on each turn
distinguishes "this was asked while reading article X") since it's what
actually answers "why does the learner have to drive every conversation"
— but this is a product call, not just a technical one, and worth a
short explicit decision before Phase 2 starts.

### 2. Where memory resolves in the sequence matters, and the natural spot adds latency — worth deciding deliberately, not discovering by profiling later

The diagram places Memory/`LearnerProfile` resolution **before**
`buildTutoSystemPrompt()`, i.e. before LLM call 1 can even happen — it has
to be synchronous and awaited there, since the system prompt needs the
summary text. That's one more sequential `await` (a repository read) in
front of an already two-LLM-call round trip. Not a redesign, just a cost
to budget for now: Phase 2 should measure this addition specifically,
rather than bundling it into "memory felt slow" later with three other
changes to untangle it from.

### 3. Memory should be ambient context, not a tool — the tool loop is the wrong seam for it

`MAX_TOOL_ITERATIONS = 4` already has to cover content lookups (article/
podcast/quiz) and knowledge-base lookups (grammar/vocabulary) potentially
in the same turn. Adding "recall what we discussed" as a 12th tool the
model has to *remember to call* competes with those for iterations and
depends on the model reliably choosing to call it — the same reliability
problem the mock-data tools had, just moved from "wrong data" to "maybe
never invoked." Memory belongs where `LearningContext` already lives:
resolved once, always present, folded into the system prompt
unconditionally — consistent with the diagram above, and worth stating
explicitly now so Phase 2 doesn't default to "just add it as a tool"
because that's the most recently-used pattern in this codebase.

### 4. The dependency-threading pattern will not scale gracefully past one more repository

`contentRepository` today is threaded as an optional field through five
layers: route → `GenerateResponseInput` → `RunToolLoopOptions` →
`ToolExecutionContext` → each tool. That's fine for one repository. Phase
2 adds a second (`ConversationRepository` or a resurrected `MemoryStore`)
through the exact same five layers; Phase 3 adds a third
(`LearnerRepository`/`ProgressRepository`). Nothing breaks doing it this
way three more times, but it's three more times touching the same five
files for the same reason. Worth collapsing into one bundled dependency
object (e.g. `AIRequestDependencies { contentRepository, conversationRepository,
learnerRepository }`) threaded as a single field, ideally as **Phase 2's
first, small step** rather than a cleanup done after Phase 4 makes it
annoying. Cheap now, since only one repository's call sites need
touching; more files to touch the longer it waits.

### 5. Streaming is already compromised for every tool-using turn — Memory doesn't make this worse, but don't expect it to make it better either

Confirmed in Phase 1 review: once any tool is registered (always true
today, `bootstrap.ts` registers 11 unconditionally), `streamResponse()`
runs the full non-streaming tool loop and yields the final answer as one
chunk (`docs/ai-architecture.md`'s own "Streaming + tools" note,
`ai-service.ts:64-78`). This was already true before Phase 1 and is
unrelated to it. Flagging only so Phase 2 doesn't get blamed for
"responses feel less live" — that regression, if perceived, predates
Memory entirely.

### 6. Not a bottleneck, confirmed working correctly: repository access is already properly gated

`ContentRepository` reads through the request's own authenticated
Supabase client — RLS denies unauthenticated reads by policy
(`supabase/content-schema.sql`). Any future `ConversationRepository`/
`LearnerRepository` should follow the identical rule: `conversationId`/
learner identity resolved server-side from the authenticated session,
never accepted as a client-supplied value in the request body. Stating
this now so it's a default assumption for Phase 2, not a decision
revisited per repository.

---

## Recommendation for how to start Phase 2

Given the above, in order:

1. Decide the conversation-threading model (finding #1) — product
   decision, blocks everything else meaningfully.
2. Introduce the bundled dependency object (finding #4) while there's
   still only one repository to migrate.
3. Build `ConversationRepository` under `src/ai/data/`, resolved as
   ambient context before prompt-build (findings #2/#3), persisted
   fire-and-forget after the loop completes.
4. Defer `LearnerRepository`/mistake-tracking (Phase 3) until Phase 2's
   conversation memory is verified working end to end — don't build both
   repositories in the same pass, for the same reason Phase 1 stayed
   scoped to five tools instead of also touching vocabulary/progress.
