"use client";

import { cn } from "@/lib/utils";
import { renderTutoMarkdown } from "@/lib/tuto-chat/markdown";
import { useProgressiveReveal } from "@/hooks/useProgressiveReveal";
import { Tuto } from "@/components/mascot/Tuto";
import type { ChatMessage } from "@/lib/tuto-chat/types";

/** A blinking text-cursor, shown only while this exact bubble is the one actively revealing — never on a completed message, never on a user bubble. */
function BlinkingCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-text-tertiary align-middle"
    />
  );
}

export interface ChatBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
  /** Tuto Workspace only (Base44 reference) — a small avatar + "Tuto" label above the bubble. Defaults to off so the legacy sheet (TutoChatPanel) renders exactly as it always has. */
  showSender?: boolean;
}

export function ChatBubble({ message, streaming, showSender = false }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isRevealing = Boolean(streaming) && !isUser;
  const revealed = useProgressiveReveal(message.content, isRevealing);
  // Only once revealed has actually caught up to the full target — a
  // streamed reply's content can still be growing while an earlier reveal
  // pass is mid-animation, and the cursor should track the true tail, not
  // blink prematurely at a mid-string position.
  const showCursor = isRevealing && revealed.length >= message.content.length;

  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      {showSender && !isUser && (
        <div className="mb-1.5 flex items-center gap-1.5 pl-1">
          <Tuto pose="neutral" size="xs" animation="none" className="h-5 w-5" />
          <span className="text-xs font-semibold text-text-tertiary">Tuto</span>
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-primary",
        )}
      >
        {isUser ? message.content : renderTutoMarkdown(revealed)}
        {showCursor && <BlinkingCursor />}
      </div>
    </div>
  );
}
