"use client";

import { useCallback, useRef, useState } from "react";
import { streamChatCompletion } from "@/lib/tuto-chat/streamChatCompletion";
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
 * Client-side conversation state for Tuto — the browser counterpart to
 * "preserve conversation history using the existing architecture": there's
 * no server-side memory (src/ai/memory is intentionally unimplemented), so
 * every turn resends the full message history so far, exactly like the
 * existing /api/ai/chat contract already expects (Sprint 1's
 * ConversationMessage[]).
 */
export function useTutoChat({ context, seedMessages }: UseTutoChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages ?? []);
  const [status, setStatus] = useState<TutoChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runTurn = useCallback(
    async (baseMessages: ChatMessage[], text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMessage: ChatMessage = { id: nextMessageId(), role: "user", content: trimmed };
      const assistantId = nextMessageId();
      const historyForRequest = [...baseMessages, userMessage].map(({ role, content }) => ({ role, content }));

      setError(null);
      setStatus("streaming");
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
    abortRef.current?.abort();
    setMessages(seed);
    setStatus("idle");
    setError(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  /** Appends a hidden assistant turn after the fact — e.g. once an async vocabulary lookup resolves — so a later follow-up question has continuity without ever rendering as a bubble. */
  const addHiddenContext = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: nextMessageId(), role: "assistant", content, hidden: true }]);
  }, []);

  return { messages, status, error, sendMessage, sendFresh, reset, stop, addHiddenContext };
}
