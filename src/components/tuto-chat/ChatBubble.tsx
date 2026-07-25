"use client";

import { cn } from "@/lib/utils";
import { renderTutoMarkdown } from "@/lib/tuto-chat/markdown";
import { useProgressiveReveal } from "@/hooks/useProgressiveReveal";
import type { ChatMessage } from "@/lib/tuto-chat/types";

export function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  const revealed = useProgressiveReveal(message.content, Boolean(streaming) && !isUser);

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-primary",
        )}
      >
        {isUser ? message.content : renderTutoMarkdown(revealed)}
      </div>
    </div>
  );
}
