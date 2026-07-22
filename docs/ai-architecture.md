# AI Architecture — Tuto's Foundation

Status: **foundation, context pipeline, and tool system complete, no
conversational feature wired to a screen yet.** Sprint 1 built the
provider/prompt/service/API plumbing; Sprint 2 made Tuto context-aware;
Sprint 3 (this update) gave Tuto six real tools backed by mock data and a
full tool-calling execution loop, so Tuto can answer from LinguABC's own
content instead of the LLM's training data alone. No sprint wires this
into a real screen. If you're looking for a chat UI, there isn't one —
`/api/ai/chat` exists and works, but nothing in the app calls it yet.

Companion to `docs/coding-standards.md` (general conventions) and
`docs/domain-model.md` (the app's actual data model, which the AI module
deliberately does not import from — see "Why the AI module doesn't import
app types" below).

---

## Why this exists

Before this sprint, "AI" in this codebase meant two narrow, non-conversational
things: `src/lib/gemini/client.ts` (a one-shot structured-JSON call the
Content Engine uses to enrich ingested articles/podcasts) and
`src/lib/tuto/messages.ts` (a fully deterministic, rules-based note
generator for the dashboard — no LLM call at all). Neither is reusable for
"Tuto talks back to a learner." This sprint builds that foundation once,
so every future conversational feature is a new call site, never a new
architecture.

---

## The nine pieces

### 1. Providers — `src/ai/providers/`

`AIProvider` (`types.ts`) is the contract: `complete()` for a full
response (optionally offered a `tools` list and able to return
`toolCalls`, added in Sprint 3), `stream()` for an async-generator of
text deltas (text-only — see "Streaming + tools" below for why). Everything
above this layer (the service, the API route) only ever talks to this
interface.

`openrouter/client.ts` is the first (and today, only) implementation —
a thin `fetch()` wrapper against OpenRouter's OpenAI-compatible
`chat/completions` endpoint, in both streaming (SSE) and non-streaming
form. `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are read from
`process.env` on every call — nothing about which model Tuto talks to is
hardcoded; changing `OPENROUTER_MODEL` is a config change, not a deploy.

`registry.ts` + `bootstrap.ts` mirror the Content Engine's own provider
pattern (`src/lib/content-engine/providers/registry.ts` /
`bootstrap.ts`) on purpose, for a reader already familiar with one to
recognize the other immediately: a `Map<id, AIProvider>`, a
`registerProvider()`/`getProvider()` pair, and an idempotent bootstrap
that registers every real provider once per server instance.

`index.ts`'s `getDefaultProvider()` reads `AI_PROVIDER` (defaults to
`"openrouter"`) and returns the matching registered provider. **Adding a
second provider is one new file under `providers/<name>/` plus one line
in `bootstrap.ts` — nothing else changes.**

### 2. Prompts — `src/ai/prompts/tuto/`

`sections.ts` holds each concern (personality, teaching philosophy, CEFR
awareness, grammar correction style, encouragement style, educational
priorities, refusal behavior, formatting rules) as an independent,
named constant — editing how Tuto corrects grammar never touches how it
encourages.

`context-block.ts` (Sprint 2) is the prompt-enrichment renderer: it turns
a `LearningContext` into a labeled-block instruction —

```
User is studying:
Podcast

Podcast title:
Everyday Conversations Vol. 3

Selected sentence:
I couldn't agree more.

User level:
B1

Learning goal:
IELTS 7
```

— rendering only the fields the caller actually populated (never
fabricates a level, goal, or selection that wasn't provided) and
returning `null` for an empty context so no block gets appended at all.
Kept in its own file, separate from `index.ts`'s section-joining, because
it's the piece most likely to grow as more context fields ship.

`index.ts`'s `buildTutoSystemPrompt(context?)` joins the sections, and —
when `context-block.ts` produced one — appends the block under a short
instruction ("Use it naturally in your response — don't just repeat it
back"), directly serving the brief's "The AI should naturally use this
context."

### 3. Context Engine — `src/ai/context/`

`types.ts` defines `LearningContext` (Zod schema + inferred type).
Every field is nullable, optional at the call site, and independent of
every other field — a caller sends only what it actually knows:

| Field | Shape | Notes |
|---|---|---|
| `currentScreen` | `Screen` enum | Home, Podcast, Article, Quiz, Vocabulary, Daily Mission — extend the enum for a new screen, nothing else changes |
| `currentActivity` | `string` | Free-form, e.g. "reading the transcript" — this module doesn't validate its vocabulary |
| `currentLesson` / `previousLesson` | `TitledReference` (`{id, title}`) | Just a pointer — no transcript/body, that's the "no podcast/article analysis" boundary |
| `currentPodcast` / `currentArticle` / `currentQuiz` | `TitledReference` | Same shape, one per content type so the prompt can say "Podcast title" vs "Article title" |
| `selectedWord` / `selectedSentence` / `selectedParagraph` | `string` | Whatever text the learner has selected right now |
| `transcriptTimestamp` | `number` (seconds, ≥0) | Position in an audio/video transcript, if one is playing |
| `userLevel` | `CefrLevel` enum | The module's own A1–C2 union, not the app's |
| `learningGoal` | `string` | Free-form — the AI module doesn't own the canonical goal list |
| `streak` | `number` (int, ≥0) | Consecutive days |
| `xp` | `number` (int, ≥0) | Total experience points |

`builder.ts`'s `buildLearningContext()` normalizes a partial object into
a complete one via `LearningContextSchema.parse()`, defaulting anything
unset to `null` — this is also where an invalid value (a negative streak,
an unrecognized CEFR level) gets rejected, and the same schema backs the
API route's request validation, so a bad `context` in an HTTP request
fails exactly the same way.

**Nothing calls `buildLearningContext()` from a real screen yet** — this
is the architecture, not the wiring. The natural future call sites are
each learning-session step component (`src/components/learning-session/`)
and the dashboard, passing whatever they already know (current CEFR
level, the content on screen, a selected word) into the API request body.

Sprint 1 shipped a single generic `currentContent: {contentType, id,
title}` field instead of the three type-specific fields above — replaced
in Sprint 2 once the brief asked for `currentPodcast`/`currentArticle`/
`currentQuiz` distinctly. Safe to change in place: nothing outside this
module referenced the old field yet.

### 4. Schemas — `src/ai/schemas/`

Zod schemas (and their inferred TypeScript types) for every message shape:
`UserMessageSchema`, `AssistantMessageSchema`, `SystemMessageSchema`, the
`ConversationMessageSchema` discriminated union of all three,
`ToolResultSchema`, and `ConversationContextSchema` (a full request:
message history + optional partial `LearningContext`). These are the
runtime-validated boundary the API route enforces against — see "API
Route" below for why a client-supplied `"system"` message is rejected,
not silently dropped.

### 5. AI Service — `src/ai/services/`

The single entry point: `generateResponse()` (one full reply) and
`streamResponse()` (an async generator of text deltas), both in
`ai-service.ts`. **No UI, no API route, no future feature should ever
import from `src/ai/providers` or `src/ai/tools` directly** — everything
goes through this service.

`tool-loop.ts`'s `runToolLoop()` is the Tool Execution Layer (Sprint 3):

```
AI → Tool Selection → Execute Tool → Return Structured Result → Continue AI Response
```

It asks `src/ai/tools`'s registry for every registered tool (never a
hardcoded list), calls the provider with them attached, and — if the
provider responds with `toolCalls` instead of a final answer — executes
each one via `executeToolCall()`, appends a `"tool"` role message with
the JSON-stringified structured result, and calls the provider again.
This repeats until the provider answers with no further tool calls, or
`MAX_TOOL_ITERATIONS` (4) is hit, at which point one final call drops the
`tools` option entirely to force a plain answer — a safety valve against
a model stuck calling tools forever. `generateResponse()` surfaces every
tool call made along the way on the returned `AssistantMessage.toolResults`.

Both entry points still build the system prompt from the caller's
`LearningContext` exactly as Sprint 1/2 did; the tool loop only changes
what happens between sending that prompt and getting a final answer.

### 6. Tools — `src/ai/tools/` (Sprint 3: real tools, mock data)

`types.ts`'s `ToolDefinition<TArgs, TResult>` is the common interface
every tool implements: `name`, `description`, a JSON Schema `parameters`
for `TArgs`, an optional `resultSchema` (a Zod schema for `TResult`), and
`execute(args, context)`. The second parameter, `ToolExecutionContext`
(`{ learningContext }`), is how a tool named `getCurrentPodcast` knows
*which* podcast without the model ever having to guess or pass an id —
the AI Service supplies it from the request's own `LearningContext`
(Sprint 2), the model only ever supplies `TArgs`.

**The six tools** (`src/ai/tools/definitions/`), each mirroring the
brief's names exactly:

| Tool | Reads from context | Mock data source |
|---|---|---|
| `getCurrentPodcast` | `currentPodcast` | `MOCK_PODCASTS` |
| `getPodcastTranscript` | `currentPodcast` (+ optional `maxSegments` arg) | `MOCK_TRANSCRIPTS` |
| `getCurrentArticle` | `currentArticle` | `MOCK_ARTICLES` |
| `getCurrentQuiz` | `currentQuiz` | `MOCK_QUIZZES` (includes the answer key — Tuto needs it to explain *why* a choice is right) |
| `getSelectedVocabulary` | `selectedWord` | `MOCK_VOCABULARY` |
| `getLearningProgress` | `streak`/`xp`/`userLevel` (blended with supplemental mock stats context doesn't carry yet) | `MOCK_PROGRESS` |

Every tool degrades gracefully instead of throwing: no `currentPodcast` in
context → `{ found: false, reason: "..." }`, not an exception. All mock
data lives in one file, `mock-data.ts` — realistic static records, no
database, no Supabase, per this sprint's explicit rule.

**Registry** (`registry.ts`) mirrors `src/ai/providers/registry.ts`
exactly: a `Map<name, ToolDefinition>`, `registerTool()`/`getTool()`, plus
`listTools()` — the mechanism behind "the AI must be able to discover
tools automatically." Nothing in the AI Service (or anywhere else) lists
tool names by hand; it always calls `listTools()`. **Adding a seventh
tool is one new file under `definitions/` plus one line in
`bootstrap.ts` — nothing else changes,** same shape as adding a provider.

**Execution layer** (`execute.ts`)'s `executeToolCall()` is where "never
plain text" is actually enforced: it looks the tool up by name (unknown
name → structured error, not a throw), parses the model's JSON arguments
(malformed → structured error), runs `execute()`, and — when the tool
declared a `resultSchema` — validates the output against it before
handing it back. A tool that throws produces a structured `{ error: "..."
}` result, never an unhandled exception that would crash the
conversation.

### 7. Memory — `src/ai/memory/` (scaffolding only)

`MemoryStore` defines `get(conversationId)` / `set(conversationId,
summary)`. No implementation exists, and the AI Service does not
reference this module at all this sprint — seeing `MemoryStore` imported
anywhere outside `src/ai/memory` today would mean the "no memory
implementation" rule got broken. See "How memory will work" below.

### 8. Actions — `src/ai/actions/` (scaffolding only)

`ActionDefinition` defines the shape of something Tuto could *do* on the
learner's behalf (mark a lesson complete, navigate to a screen) — distinct
from a Tool, which only returns information. `registeredActions` is empty.

### API Route — `src/app/api/ai/chat/route.ts`

`POST /api/ai/chat`. Validates the body against `ChatRequestSchema` (a
Zod union of only `user`/`assistant` messages — a `"system"` role is
rejected with a 400, since Tuto's system prompt is always the service's
own). Normalizes the optional `context` into a full `LearningContext` via
`buildLearningContext()`, then streams the response back as
Server-Sent Events: `data: {"type":"delta","content":"..."}`,
`data: {"type":"done"}`, or — since the HTTP status and headers are
already committed once streaming starts — `data: {"type":"error","message":"..."}`
for any mid-stream failure. Verified locally end to end: malformed JSON →
400, an empty/invalid message array → 400 with field-level detail via
`z.treeifyError()`, a client-sent system message → 400, and a
well-formed request with no `OPENROUTER_API_KEY` configured → a clean SSE
error event rather than a crash. **Nothing about this route changed in
Sprint 3** — it still just calls `streamResponse()`; the tool loop is
entirely inside the service.

---

## Request flow

Two paths, depending on whether the model calls a tool.

**No tool needed** (identical to Sprint 1/2 — true token-by-token streaming):

```mermaid
sequenceDiagram
    participant Client
    participant Route as /api/ai/chat
    participant Service as AI Service
    participant Provider as OpenRouter Provider
    participant OpenRouter

    Client->>Route: POST { messages, context }
    Route->>Route: validate (Zod), buildLearningContext(context)
    Route->>Service: streamResponse({ messages, learningContext })
    Service->>Provider: stream({ system + history })
    Provider->>OpenRouter: POST chat/completions (stream: true)
    OpenRouter-->>Provider: SSE deltas
    Service-->>Route: AsyncGenerator<string>
    Route-->>Client: SSE (delta / done / error)
```

**Tool needed** (Sprint 3 — the Tool Execution Layer, `tool-loop.ts`):

```mermaid
sequenceDiagram
    participant Service as AI Service
    participant Loop as runToolLoop
    participant Provider as OpenRouter Provider
    participant Tools as Tool Registry + Execution
    participant Client

    Service->>Loop: runToolLoop(provider, messages, learningContext)
    Loop->>Provider: complete({ messages, tools: listTools() })
    Provider-->>Loop: toolCalls: [getCurrentPodcast]
    Loop->>Tools: executeToolCall(call, { learningContext })
    Tools-->>Loop: { found: true, podcast: {...} } (structured JSON)
    Loop->>Provider: complete({ messages + tool result })
    Provider-->>Loop: final content, no more tool calls
    Loop-->>Service: { completion, toolResults }
    Service-->>Client: yields completion.content (single chunk)
```

### Streaming + tools

Once the tool loop runs, the final answer is delivered as a single
`yield` from `streamResponse()`, not incremental token deltas — a real
tradeoff, not an oversight. A tool call has to be a fully-formed
`{ name, arguments }` before it can be executed at all, so every turn
that might call a tool goes through `complete()`, never `stream()`.
Adding true token-level streaming *after* the last tool call resolves
would mean accumulating a provider's streamed `tool_calls` deltas
correctly (a well-known but genuinely fiddly parsing problem: arguments
arrive as partial JSON string fragments across many chunks) — real,
scoped future work, not attempted this sprint. `streamResponse()` still
checks `listTools().length === 0` and falls back to pure streaming when
true — in practice, since `bootstrap.ts` always registers the six
built-in tools, every real request goes through the tool loop today; the
empty-registry branch exists so the old pure-streaming behavior is still
reachable (and tested) rather than silently gone.

---

## Why the AI module doesn't import app types

`LearningContext.userLevel` is its own `CefrLevel` union
(`"A1"|"A2"|"B1"|"B2"|"C1"|"C2"`), not the app's `CefrLevel` from
`@/types/content`. `currentPodcast`/`currentArticle`/`currentQuiz` are all
the same generic `TitledReference` (`{id, title}`), not a
`PodcastContent`/`ArticleContent`/quiz type — deliberately too thin to
support "podcast analysis" or "article analysis" even by accident. This
is deliberate: the brief was "no feature-specific code," and importing
the app's content types would quietly couple the AI foundation to
whatever those types look like today. The app maps its own types onto
this shape at the call site (once a call site exists) — the AI module
never reaches back into `src/lib/content` or `src/types`.

Same principle in `src/ai/tools/mock-data.ts`: `MockPodcast`,
`MockArticle`, etc. are their own minimal shapes, not the app's
`PodcastContent`/`ArticleContent` from `@/types/content` — the tool
layer is exactly as self-contained as the context layer.

---

## Tool lifecycle

1. **Definition** — a file under `src/ai/tools/definitions/` exports a
   `ToolDefinition`: `name`, `description`, a JSON Schema `parameters`,
   an optional `resultSchema`, and `execute(args, context)`.
2. **Registration** — `bootstrap.ts` calls `registerTool()` for it once
   per server instance (idempotent — safe to call on every request).
3. **Discovery** — `runToolLoop()` never names a tool; it calls
   `listTools()` and hands the *entire* registered set to the provider on
   every turn. The model decides whether any tool is relevant.
4. **Selection** — the provider (OpenRouter) returns `toolCalls` on its
   completion if it chose to call one or more tools instead of (or before)
   answering directly.
5. **Execution** — `executeToolCall()` looks the tool up by name, parses
   the model-supplied JSON arguments, calls `execute(args, { learningContext })`,
   and validates the result against `resultSchema` if one exists. Every
   outcome — success, unknown tool, bad arguments, a thrown error — becomes
   a structured result; nothing here ever throws back into the loop.
6. **Continuation** — the structured result is JSON-stringified into a
   `"tool"` role message and appended to the conversation; the provider is
   called again with it in context, and can either answer or call another
   tool (bounded by `MAX_TOOL_ITERATIONS`).
7. **Response** — once the provider answers with no further tool calls,
   that's the final content `generateResponse()`/`streamResponse()`
   returns, along with every tool call made along the way
   (`AssistantMessage.toolResults`).

## Future expansion

### How memory will work

`src/ai/memory/types.ts`'s `MemoryStore` interface is the seam. A real
implementation — likely a short conversation summary written back to
Supabase per learner, not a full transcript — would live in
`src/ai/memory/<implementation>.ts`, get registered similarly to how
providers register, and the AI Service would accept an optional
`conversationId`, call `memoryStore.get()` before building the prompt, and
`memoryStore.set()` after a reply completes. Nothing about the service's
public signature (`generateResponse`/`streamResponse`) needs to change to
add this — it's an additive parameter.

### How RAG will plug in

No vector DB, no embeddings, no retrieval exist today, and none should be
inferred from anything in this module. Now that Sprint 3 shipped a real
tool system, there are two natural seams, and which one fits depends on
*what* is being retrieved:

- **Retrieval as a tool** — e.g. "find the vocabulary entries most
  relevant to what the learner just asked" fits the existing pattern
  exactly: a new `ToolDefinition` (a `searchVocabulary` tool, say) whose
  `execute()` queries a vector store instead of `mock-data.ts`. Nothing
  about the registry, the loop, or the provider layer changes — this is
  the same seam "Future database integration" below uses.
- **Retrieval as ambient context** — e.g. "always ground Tuto's answers
  in the current lesson's material" doesn't wait for the model to decide
  to call a tool; it belongs in `src/ai/context/builder.ts`:
  `buildLearningContext()` would gain an optional async retrieval step
  that enriches the context object with retrieved snippets *before* it
  reaches `buildTutoSystemPrompt()` — the prompt layer and the service
  layer wouldn't need to know retrieval happened at all.

### Future database integration

Every tool's mock data lookup (`MOCK_PODCASTS[id]`, `MOCK_ARTICLES[id]`,
etc. in `src/ai/tools/mock-data.ts`) is a single, isolated line inside
that tool's `execute()`. Replacing mocks with real data is a change to
*that line* — e.g. `getCurrentPodcastTool.execute()` swaps
`MOCK_PODCASTS[ref.id]` for `await getPodcastById(supabase, ref.id)`
(`src/lib/content/queries.ts` already exists and does exactly this for
the rest of the app) — not a change to `ToolDefinition`, the registry,
the execution layer, the tool loop, or the AI Service. **The AI layer
doesn't change**, exactly as the brief requires. The one adjustment a
real implementation needs that the mock doesn't: `execute()` would become
genuinely async against a network call, which the interface already
supports (`execute(): Promise<TResult>`), and it would need a Supabase
client passed in somehow (likely added to `ToolExecutionContext`
alongside `learningContext`) — a small, additive interface change, not a
redesign.

---

## Verification performed

### Sprint 1
- `npm run build` — succeeds; `/api/ai/chat` registers as a dynamic route
  alongside every existing route, no regressions.
- `npx eslint src/ai src/app/api/ai` — clean.
- Live smoke test against a local `next start`:
  - Malformed JSON body → `400 { "error": "Invalid JSON body" }`
  - Empty `messages` array → `400` with Zod field-level detail
  - Client-supplied `"system"` role message → `400` (rejected, not silently dropped)
  - Valid request, no `OPENROUTER_API_KEY` set → `200` with a clean
    `data: {"type":"error",...}` SSE event, not a crash
  - Valid request, fake `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` set → confirmed
    the code reaches an actual outbound `fetch()` to `openrouter.ai`
    (blocked only by this sandbox's own network allowlist, not a code
    defect — the same restriction encountered investigating the
    `linguabc.xyz` DNS issue). In production this reaches OpenRouter
    normally.

### Sprint 2
- `npm run build` and `npx tsc --noEmit` — both clean after expanding
  `LearningContext` to the full field set.
- `npx eslint src/ai src/app/api/ai` — clean.
- Unit-level check of `buildTutoSystemPrompt(buildLearningContext(...))`
  with every new field populated (screen, podcast, selected sentence,
  level, goal, streak, XP, transcript timestamp, previous lesson) —
  confirmed the rendered block matches the brief's example format
  exactly, and confirmed an empty context renders no block at all (no
  stray heading, no empty instruction).
- Live smoke test against a local `next start`, through the real
  `POST /api/ai/chat` route (not just the unit-level prompt check):
  - Full rich context (screen, podcast reference, selected sentence,
    level, goal, streak, XP, transcript timestamp) → `200`, streamed
    cleanly, no validation errors.
  - Negative `streak` → `400` with a field-level Zod error.
  - Invalid `userLevel` (`"Z9"`) → `400` with a field-level Zod error.
  - Confirmed SSE headers (`text/event-stream`, chunked) are unaffected
    by the schema change.

### Sprint 3
- `npm run build`, `npx tsc --noEmit`, `npx eslint src/ai src/app/api/ai`
  — all clean after adding the tool system and extending the provider
  interface with `tools`/`toolCalls`.
- **Full pipeline, mock provider** (a scripted fake `AIProvider`, no
  network involved) — verified end to end:
  - `runToolLoop()` offered the provider all six registered tools by
    name, with no hardcoded list.
  - The mock "chose" to call `getCurrentPodcast`; `executeToolCall()`
    resolved it against a `LearningContext` with `currentPodcast: {id:
    "p1", ...}`, returned the real mock podcast record as structured
    JSON, and the loop's second provider call correctly received it as a
    `"tool"` role message and produced a final answer referencing the
    actual mock title.
  - **Graceful degradation**: an empty `LearningContext` (no
    `currentPodcast` set) → tool returns `{ found: false, reason: "..."
    }`, no exception. A model requesting a nonexistent tool name →
    `{ error: "Unknown tool ..." }`, no exception.
  - **Safety valve**: a mock provider that requests a tool call on every
    single turn (simulating a stuck model) was capped at exactly
    `MAX_TOOL_ITERATIONS + 1` (5) provider calls, confirming the loop
    terminates instead of running forever.
- **Live smoke test against a local `next start`, through the real
  `POST /api/ai/chat` route**:
  - Rich context including a `currentPodcast` reference, no
    `OPENROUTER_API_KEY` set → `200`, clean SSE error event — the tool
    loop's first `complete()` call still fails at the same
    config-check as before, and the failure still surfaces correctly.
  - Fake `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` set → confirmed the
    request (now with `tools` attached) reaches an actual outbound
    `fetch()` to `openrouter.ai`, blocked only by this sandbox's network
    allowlist, not a code defect.

## Explicitly out of scope

Per every sprint's brief so far: no memory implementation, no RAG, no
vector DB, no vector search, no database (every tool reads from
`src/ai/tools/mock-data.ts`, never Supabase), no podcast/article/quiz
content *analysis* (tools return metadata/transcripts/questions
verbatim from mock data — nothing summarizes, grades, or interprets
them), no UI. No screen calls `/api/ai/chat` yet — that's a future
sprint, once a specific feature (and its own scope) is defined.
