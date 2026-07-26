import type { ZodType } from "zod";
import { z } from "zod";
import { getDefaultProvider, AIProviderError } from "@/ai/providers";
import type { AIProviderMessage } from "@/ai/providers";
import { buildTutoSystemPrompt } from "@/ai/prompts";
import { buildLearningContext } from "@/ai/context";
import type { LearningContext } from "@/ai/context";
import type { AssistantMessage, ConversationMessage, ToolResult } from "@/ai/schemas";
import { listTools, bootstrapTools } from "@/ai/tools";
import type { AIDependencies, ConversationMemory, ConversationMemoryMessage } from "@/ai/data";
import type { LearnerProfile } from "@/ai/learner";
import type { LearnerState } from "@/ai/learning-engine";
import type { TeachingPlan } from "@/ai/coach-planner";
import { planTeaching } from "@/ai/coach-planner";
import type { LearningSessionPlan } from "@/ai/learning-session-engine";
import { planLearningSession } from "@/ai/learning-session-engine";
import type { OrchestratorDecision, ConversationTurn } from "@/ai/learning-orchestrator";
import { orchestrateSession } from "@/ai/learning-orchestrator";
import { INITIAL_ORCHESTRATOR_STATE } from "@/ai/data";
import type { TurnSignal } from "@/ai/turn-classifier";
import { classifyTurn } from "@/ai/turn-classifier";
import { runToolLoop } from "./tool-loop";

export interface GenerateResponseInput {
  /** User/assistant turns only — a client-supplied "system" message is rejected before this point (src/app/api/ai/chat). */
  messages: ConversationMessage[];
  learningContext?: LearningContext | null;
  /** The bundled repository access (src/ai/data) offered to every tool call this request makes, and used to resolve Learner/Conversation Memory below — omit only when no repositories are available yet. */
  dependencies?: AIDependencies;
  /**
   * Identifies which Conversation Memory to read/update (src/ai/data's
   * ConversationRepository) — never the learner's durable identity, which
   * is resolved from `dependencies.learnerRepository` regardless of this
   * value. Omit to skip Conversation Memory entirely.
   */
  conversationId?: string | null;
}

interface ResolvedMemory {
  conversationMemory: ConversationMemory | null;
  learnerProfile: LearnerProfile | null;
}

/**
 * Resolves both memory systems in parallel — read-only, called from every
 * AI Service entry point (chat, vocabulary, article), not just the
 * conversational ones, since "the LLM should receive both naturally
 * during prompt construction" applies everywhere a prompt gets built.
 * Conversation Memory and Learner Memory come from independent
 * repositories and are folded into the prompt as two separate blocks
 * (src/ai/prompts/tuto) — see docs/ai-coach-audit.md's Phase 2 model for
 * why they're never merged into one.
 */
async function resolveMemory(input: GenerateResponseInput): Promise<ResolvedMemory> {
  const [conversationMemory, learnerProfile] = await Promise.all([
    input.dependencies && input.conversationId ? input.dependencies.conversationRepository.get(input.conversationId) : Promise.resolve(null),
    input.dependencies ? input.dependencies.learnerRepository.getProfile() : Promise.resolve(null),
  ]);

  return { conversationMemory, learnerProfile };
}

interface ResolvedTeaching {
  learnerState: LearnerState | null;
  teachingPlan: TeachingPlan | null;
  sessionPlan: LearningSessionPlan | null;
}

const NO_TEACHING: ResolvedTeaching = { learnerState: null, teachingPlan: null, sessionPlan: null };

/**
 * Resolves the Learning Engine's LearnerState, the Coach Planner's
 * TeachingPlan (Phase 4B), and the Learning Session Engine's
 * LearningSessionPlan (Phase 6) — only called from generateResponse()/
 * streamResponse(), the actual open-ended chat path. Deliberately not
 * called from generateStructuredResponse(): "deciding what to teach
 * next" and "how the session should flow" don't apply to a one-shot
 * vocabulary explanation or article summary, which already have a fixed,
 * narrow task — see src/ai/coach-planner's and
 * src/ai/learning-session-engine's own doc comments for why neither a
 * lesson plan nor a session structure belongs there.
 *
 * planTeaching() and planLearningSession() are both pure/deterministic
 * (src/ai/coach-planner/planner.ts, src/ai/learning-session-engine/engine.ts)
 * — everything async here is fetching their inputs, never the decisions
 * themselves. planLearningSession() needs no I/O of its own beyond what
 * planTeaching() already required (it consumes the same learnerState and
 * the TeachingPlan planTeaching() just produced), so no new fetch is
 * added by this phase — only a second pure call.
 */
async function resolveTeachingPlan(input: GenerateResponseInput, learningContext: LearningContext): Promise<ResolvedTeaching> {
  if (!input.dependencies) return NO_TEACHING;

  const [learnerState, availableContent] = await Promise.all([
    input.dependencies.learnerRepository.getLearnerState(),
    input.dependencies.contentRepository.listAvailableContent(),
  ]);

  const teachingPlan = planTeaching({
    learnerState,
    learningContext,
    currentScreen: learningContext.currentScreen,
    availableContent,
  });

  const sessionPlan = planLearningSession({ teachingPlan, learnerState, learningContext });

  return { learnerState, teachingPlan, sessionPlan };
}

/**
 * Runs the Turn Classifier (Phase 8, src/ai/turn-classifier) on the
 * learner's latest message, if there is one. Independent of memory/
 * teaching resolution — it needs nothing from either, so it runs in
 * parallel with them (see generateResponse()/streamResponse()) rather
 * than adding to the critical path. Returns null when there's no learner
 * turn to classify yet (e.g. the very first assistant greeting) or when
 * classifyTurn() itself couldn't produce a signal — both cases the
 * Orchestrator already handles as an honest gap, never a guess.
 */
function resolveTurnSignal(input: GenerateResponseInput): Promise<TurnSignal | null> {
  const lastMessage = input.messages[input.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") return Promise.resolve(null);

  let priorAssistantMessage: string | null = null;
  for (let i = input.messages.length - 2; i >= 0; i--) {
    if (input.messages[i].role === "assistant") {
      priorAssistantMessage = input.messages[i].content;
      break;
    }
  }

  return classifyTurn({ learnerMessage: lastMessage.content, priorAssistantMessage });
}

/**
 * Resolves the Learning Orchestrator's live decision (Phase 7) — pure, no
 * I/O of its own: it only needs what resolveMemory()/resolveTeachingPlan()/
 * resolveTurnSignal() already fetched (the session's persisted runtime
 * state, the LearningSessionPlan/LearnerState this turn should use, and
 * the Turn Classifier's perception of the learner's latest message).
 * Returns null exactly when there's no session to run one for (no
 * dependencies, i.e. the same condition under which resolveTeachingPlan()
 * returned NO_TEACHING) — a live lesson decision doesn't exist without a
 * plan behind it. The Current Conversation the Orchestrator receives is
 * this turn's incoming message history — the learner's latest message,
 * not yet including the reply about to be generated for it.
 */
function resolveOrchestratorDecision(
  input: GenerateResponseInput,
  memory: ResolvedMemory,
  teaching: ResolvedTeaching,
  turnSignal: TurnSignal | null,
): OrchestratorDecision | null {
  if (!teaching.sessionPlan) return null;

  const conversation: ConversationTurn[] = input.messages.filter(
    (message): message is ConversationTurn => message.role === "user" || message.role === "assistant",
  );

  return orchestrateSession({
    sessionPlan: teaching.sessionPlan,
    state: memory.conversationMemory?.orchestratorState ?? INITIAL_ORCHESTRATOR_STATE,
    conversation,
    lastTurnSignal: turnSignal,
    learnerState: teaching.learnerState,
  });
}

function toProviderMessages(
  input: GenerateResponseInput,
  memory: ResolvedMemory,
  teaching: ResolvedTeaching = NO_TEACHING,
  orchestratorDecision: OrchestratorDecision | null = null,
): AIProviderMessage[] {
  const systemPrompt = buildTutoSystemPrompt({
    learningContext: input.learningContext,
    conversationMemory: memory.conversationMemory,
    learnerProfile: memory.learnerProfile,
    learnerState: teaching.learnerState,
    teachingPlan: teaching.teachingPlan,
    sessionPlan: teaching.sessionPlan,
    orchestratorDecision,
  });

  const history: AIProviderMessage[] = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }));

  return [{ role: "system", content: systemPrompt }, ...history];
}

function toToolResults(loopToolResults: Awaited<ReturnType<typeof runToolLoop>>["toolResults"]): ToolResult[] | undefined {
  if (loopToolResults.length === 0) return undefined;
  return loopToolResults.map((executed) => ({
    toolCallId: executed.toolCallId,
    toolName: executed.toolName,
    content: JSON.stringify(executed.result),
    isError: executed.isError,
  }));
}

/**
 * Persists Conversation Memory after a chat turn completes — the current
 * message history plus the just-generated reply (ConversationRepository
 * itself caps this to MAX_REMEMBERED_MESSAGES), plus whatever content was
 * in view. Awaited, not fire-and-forget: on a serverless request handler
 * there's no guarantee code keeps running after the response finishes, so
 * an un-awaited write here would be a write that silently never happens.
 * Only called from generateResponse()/streamResponse() — a one-shot
 * generateStructuredResponse() call (vocabulary, article) reads memory
 * but never writes a new conversational turn into it, since it isn't one.
 *
 * Also persists the Orchestrator's nextState (Phase 7) alongside the
 * existing fields, same reasoning as recentMessages/currentContent: this
 * is the runtime progress through *this* conversation's live lesson, and
 * it must be read back on the next turn or the Orchestrator would
 * restart from step zero every reply.
 */
async function persistConversationMemory(
  input: GenerateResponseInput,
  learningContext: LearningContext,
  replyContent: string,
  orchestratorDecision: OrchestratorDecision | null = null,
): Promise<void> {
  if (!input.dependencies || !input.conversationId) return;

  const currentContent: ConversationMemory["currentContent"] = learningContext.currentArticle
    ? { contentType: "article", id: learningContext.currentArticle.id, title: learningContext.currentArticle.title }
    : learningContext.currentPodcast
      ? { contentType: "podcast", id: learningContext.currentPodcast.id, title: learningContext.currentPodcast.title }
      : null;

  const recentMessages: ConversationMemoryMessage[] = [...input.messages, { role: "assistant" as const, content: replyContent }].filter(
    (message): message is ConversationMemoryMessage => message.role === "user" || message.role === "assistant",
  );

  await input.dependencies.conversationRepository.save(input.conversationId, {
    recentMessages,
    currentContent,
    orchestratorState: orchestratorDecision?.nextState ?? null,
  });
}

/**
 * Records the objective "the learner asked Tuto to explain/produce
 * something" event (Phase 3) — every generateStructuredResponse() call
 * (vocabulary explanation, article summary/discussion/comprehension
 * questions) mechanically *is* this, no model judgment required: the
 * evidence is that this code path ran, not an inference about the
 * learner's state. Never allowed to fail the actual response — a signal
 * write is bookkeeping, not part of the contract this function promises
 * its caller.
 */
async function recordExplanationRequested(input: GenerateResponseInput, learningContext: LearningContext, responseFormatName: string): Promise<void> {
  if (!input.dependencies) return;

  const topic = learningContext.selectedWord ?? learningContext.currentArticle?.title ?? null;
  const skill = learningContext.selectedWord ? "vocabulary" : learningContext.currentArticle ? "reading" : null;

  try {
    await input.dependencies.signalRepository.record({
      type: "explanation_requested",
      topic,
      skill,
      evidence: { responseFormatName },
      source: "chat",
      confidence: null,
    });
  } catch {
    // Signal logging is best-effort — never let it surface as a failure of the actual AI response.
  }
}

/**
 * The single entry point for talking to an AI provider (Sprint 1, Phase 6;
 * tool-calling added in Sprint 3; Learner/Conversation Memory added in
 * Phase 2). Nothing outside src/ai — not a Client Component, not another
 * route — should ever import from src/ai/providers or src/ai/tools
 * directly; everything goes through generateResponse()/streamResponse()/
 * generateStructuredResponse() so the provider, the system prompt, the
 * context wiring, the memory resolution, and the tool loop can all change
 * without touching a caller.
 */
export async function generateResponse(input: GenerateResponseInput): Promise<AssistantMessage> {
  const provider = getDefaultProvider();
  const learningContext = input.learningContext ?? buildLearningContext();
  const [memory, teaching, turnSignal] = await Promise.all([resolveMemory(input), resolveTeachingPlan(input, learningContext), resolveTurnSignal(input)]);
  const orchestratorDecision = resolveOrchestratorDecision(input, memory, teaching, turnSignal);
  const { completion, toolResults } = await runToolLoop(provider, toProviderMessages(input, memory, teaching, orchestratorDecision), learningContext, {
    dependencies: input.dependencies,
  });

  await persistConversationMemory(input, learningContext, completion.content, orchestratorDecision);

  return { role: "assistant", content: completion.content, toolResults: toToolResults(toolResults) };
}

/**
 * Streaming counterpart. With no tools registered, this streams text
 * deltas exactly as Sprint 1/2 did. Once any tool is registered (true
 * from Sprint 3 on, since src/ai/tools/bootstrap.ts always registers the
 * built-in tools), a request runs the full tool loop first — which is
 * non-streaming, a tool call must be fully assembled before it can be
 * executed — and yields its final answer as a single chunk. See
 * docs/ai-architecture.md's "Streaming + tools" note for this tradeoff.
 */
export async function* streamResponse(input: GenerateResponseInput): AsyncGenerator<string> {
  const provider = getDefaultProvider();
  bootstrapTools();

  if (listTools().length === 0) {
    const memory = await resolveMemory(input);
    for await (const chunk of provider.stream({ messages: toProviderMessages(input, memory) })) {
      if (chunk.delta) yield chunk.delta;
    }
    return;
  }

  const learningContext = input.learningContext ?? buildLearningContext();
  const [memory, teaching, turnSignal] = await Promise.all([resolveMemory(input), resolveTeachingPlan(input, learningContext), resolveTurnSignal(input)]);
  const orchestratorDecision = resolveOrchestratorDecision(input, memory, teaching, turnSignal);
  const { completion } = await runToolLoop(provider, toProviderMessages(input, memory, teaching, orchestratorDecision), learningContext, {
    dependencies: input.dependencies,
  });

  await persistConversationMemory(input, learningContext, completion.content, orchestratorDecision);
  if (completion.content) yield completion.content;
}

export interface GenerateStructuredResponseInput<T> extends GenerateResponseInput {
  /** A short stable identifier for this response shape, sent to the provider as the JSON Schema's name (e.g. "vocabulary_explanation"). */
  responseFormatName: string;
  resultSchema: ZodType<T>;
}

/**
 * Structured-output counterpart to generateResponse() (Sprint 4): derives
 * a JSON Schema from `resultSchema` (via `z.toJSONSchema()`) and asks the
 * provider to constrain its final answer to it, then re-validates the
 * parsed JSON against that same Zod schema before returning — defense in
 * depth, since OpenRouter fans a request out to many different underlying
 * models and not all of them honor strict JSON Schema mode equally well.
 * Still runs the full tool loop exactly like generateResponse() — a
 * structured-output request can still call a tool first to ground its
 * answer in real data before formatting the final JSON. Reads Learner/
 * Conversation Memory exactly like generateResponse() does, but never
 * writes a new turn into Conversation Memory — this is a one-shot feature
 * call (vocabulary explanation, article summary), not a chat turn.
 */
export async function generateStructuredResponse<T>(input: GenerateStructuredResponseInput<T>): Promise<T> {
  const provider = getDefaultProvider();
  const learningContext = input.learningContext ?? buildLearningContext();
  const responseFormat = { name: input.responseFormatName, schema: z.toJSONSchema(input.resultSchema) };
  const memory = await resolveMemory(input);

  const { completion } = await runToolLoop(provider, toProviderMessages(input, memory), learningContext, {
    responseFormat,
    dependencies: input.dependencies,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(completion.content);
  } catch {
    throw new AIProviderError("The AI did not return valid JSON for a structured response.", 502, true);
  }

  const result = input.resultSchema.safeParse(parsed);
  if (!result.success) {
    throw new AIProviderError(`The AI's structured response didn't match the expected shape: ${result.error.message}`, 502, true);
  }

  await recordExplanationRequested(input, learningContext, input.responseFormatName);

  return result.data;
}
