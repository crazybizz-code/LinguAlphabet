"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamChatCompletion } from "@/lib/tuto-chat/streamChatCompletion";
import { getRecentConversation } from "@/lib/tuto-chat/getRecentConversation";
import type { ChatOrchestratorAction } from "@/lib/tuto-chat/streamChatCompletion";
import type { ChatMessage, TutoContextInput } from "@/lib/tuto-chat/types";

export type TutoChatStatus = "idle" | "streaming" | "error";

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `tuto-msg-${messageIdCounter}`;
}

export interface UseTutoChatOptions {
  /** Whatever LearningContext the caller has on hand right now — sent with every turn, same as every AI route since Sprint 2. */
  context: TutoContextInput;
  /** Primes the conversation (e.g. a vocabulary card already shown) without rendering as a visible bubble. */
  seedMessages?: ChatMessage[];
}

/**
 * Client-side conversation state for Tuto: every turn resends the full
 * message history so far, exactly like the existing /api/ai/chat contract
 * already expects (Sprint 1's ConversationMessage[]). Real server-side
 * memory does exist (src/ai/data's ConversationRepository, read/written on
 * every turn) — but until this hook hydrates from it, a page refresh wiped
 * every visible bubble while the server silently remembered everything,
 * a mismatch a learner could actually notice (docs/mvp-completion-audit.md
 * P0.2). The mount effect below closes that gap by reading back the same
 * ConversationMemory the server already persists.
 */
export function useTutoChat({ context, seedMessages }: UseTutoChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages ?? []);
  const [status, setStatus] = useState<TutoChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  /** What the Learning Orchestrator (src/ai/learning-orchestrator) decided on the most recently completed turn — null until a turn with a live session plan finishes. See docs/mvp-completion-audit.md P0.4. */
  const [lastOrchestratorAction, setLastOrchestratorAction] = useState<ChatOrchestratorAction | null>(null);
  /** Tuto Workspace's contextual quick-action chips for the most recently completed turn (src/ai/services/quick-actions.ts) — empty until a turn completes, and cleared the instant a new turn starts (see runTurn below) so a stale action never lingers under a new, unrelated reply. */
  const [lastQuickActions, setLastQuickActions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);
  /**
   * Shared with reset() below: an in-flight hydration fetch must never
   * resolve into a conversation the learner has since deliberately reset
   * (a new text selection, a fresh "ask about this article") — that would
   * silently resurrect unrelated history into what's supposed to be a
   * clean scoped conversation. Unmount-cleanup alone doesn't cover this,
   * since reset() doesn't unmount the component.
   */
  const hydrationCancelledRef = useRef(false);

  /**
   * Hydrates from server-persisted ConversationMemory once, on mount —
   * never overwrites an explicit `seedMessages` (a caller priming this
   * conversation with specific hidden context takes precedence over
   * generic history) and never overwrites messages already in flight if
   * the learner started typing before this resolved.
   */
  useEffect(() => {
    if (seedMessages || hydratedRef.current) return;
    hydratedRef.current = true;

    void getRecentConversation().then((recentMessages) => {
      if (hydrationCancelledRef.current || recentMessages.length === 0) return;
      setMessages((prev) => (prev.length > 0 ? prev : recentMessages.map((message) => ({ id: nextMessageId(), ...message }))));
    });
    return () => {
      hydrationCancelledRef.current = true;
    };
  }, [seedMessages]);

  const runTurn = useCallback(
    async (baseMessages: ChatMessage[], text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMessage: ChatMessage = { id: nextMessageId(), role: "user", content: trimmed };
      const assistantId = nextMessageId();
      const historyForRequest = [...baseMessages, userMessage].map(({ role, content }) => ({ role, content }));

      setError(null);
      setStatus("streaming");
      setLastQuickActions([]);
      setMessages([...baseMessages, userMessage, { id: assistantId, role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of streamChatCompletion(historyForRequest, context, controller.signal)) {
          if (event.type === "delta") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId ? { ...message, content: message.content + event.content } : message,
              ),
            );
          } else if (event.type === "done") {
            setLastOrchestratorAction(event.orchestratorAction ?? null);
            setLastQuickActions(event.quickActions ?? []);
          } else if (event.type === "error") {
            setError(event.message);
            setStatus("error");
            return;
          }
        }
        setStatus("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      }
    },
    [context],
  );

  /** Sends a turn continuing the existing conversation so far. */
  const sendMessage = useCallback(
    (text: string) => {
      if (status === "streaming") return;
      void runTurn(messages, text);
    },
    [messages, status, runTurn],
  );

  /**
   * Sprint UX-3.1 (Polish): re-sends the most recent user turn after an
   * error, rather than leaving the learner to retype their question.
   * Rebuilds from everything BEFORE that turn (not `messages` as-is) so
   * the failed attempt's user message and its empty assistant stub are
   * both replaced by a clean retry, not left behind as a stray blank
   * bubble ahead of the new attempt.
   */
  const retryLast = useCallback(() => {
    if (status === "streaming") return;
    const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;
    const lastUserMessage = messages[lastUserIndex];
    void runTurn(messages.slice(0, lastUserIndex), lastUserMessage.content);
  }, [messages, status, runTurn]);

  /**
   * Starts a brand-new conversation with this message, discarding whatever
   * came before — used when a fresh trigger (a new text selection, a fresh
   * "ask about the article" open) shouldn't inherit an unrelated earlier
   * exchange. Builds its own base array rather than relying on `reset()`
   * followed by `sendMessage()`, which would race: `sendMessage`'s closure
   * would still see the pre-reset `messages` since React batches the two
   * state updates instead of applying `reset` before `sendMessage` reads it.
   */
  const sendFresh = useCallback(
    (text: string, seed: ChatMessage[] = []) => {
      if (status === "streaming") return;
      void runTurn(seed, text);
    },
    [status, runTurn],
  );

  const reset = useCallback((seed: ChatMessage[] = []) => {
    hydrationCancelledRef.current = true;
    abortRef.current?.abort();
    setMessages(seed);
    setStatus("idle");
    setError(null);
    setLastOrchestratorAction(null);
    setLastQuickActions([]);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  /** Appends a hidden assistant turn after the fact — e.g. once an async vocabulary lookup resolves — so a later follow-up question has continuity without ever rendering as a bubble. */
  const addHiddenContext = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: nextMessageId(), role: "assistant", content, hidden: true }]);
  }, []);

  return { messages, status, error, lastOrchestratorAction, lastQuickActions, sendMessage, sendFresh, reset, stop, addHiddenContext, retryLast };
}
