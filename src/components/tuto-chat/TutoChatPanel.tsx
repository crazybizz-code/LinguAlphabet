"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUp } from "lucide-react";
import { ChatBubble } from "./ChatBubble";
import type { ChatMessage } from "@/lib/tuto-chat/types";
import type { TutoChatStatus } from "@/hooks/useTutoChat";

export interface TutoChatPanelProps {
  messages: ChatMessage[];
  status: TutoChatStatus;
  error: string | null;
  onSend: (text: string) => void;
  /** Rendered above the message list — e.g. a VocabularyCard for the word-lookup flow. Omit for a plain conversation. */
  header?: ReactNode;
  placeholder?: string;
}

/**
 * The reusable conversation surface behind every Tuto interaction in this
 * sprint (word lookup follow-ups, article selection actions, ask-about-
 * the-article) — one component, three trigger points, so streaming
 * rendering, loading states, and error handling are each built once.
 *
 * Deliberately not its own scroll container: this renders inside
 * EditSheet's existing scrollable content pane (src/components/profile/EditSheet.tsx),
 * so the input row is `sticky bottom-0` rather than living in a separate
 * flex region — no change to EditSheet's layout needed for a pinned input.
 */
export function TutoChatPanel({ messages, status, error, onSend, header, placeholder = "Ask Tuto a question…" }: TutoChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const visibleMessages = messages.filter((message) => !message.hidden);
  const lastMessage = visibleMessages[visibleMessages.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages.length, lastMessage?.content]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || status === "streaming") return;
    onSend(draft);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-3">
      {header}
      {visibleMessages.map((message, index) => (
        <ChatBubble
          key={message.id}
          message={message}
          streaming={status === "streaming" && index === visibleMessages.length - 1 && message.role === "assistant"}
        />
      ))}
      {error && <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      <div ref={endRef} aria-hidden="true" />

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 -mx-6 flex items-center gap-2 border-t border-border bg-bg-card/95 px-6 py-3 backdrop-blur-sm"
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={status === "streaming"}
          className="h-12 flex-1 rounded-2xl bg-bg-muted px-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || status === "streaming"}
          aria-label="Send"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-text-on-primary transition-all hover:opacity-90 active:scale-[0.95] disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
