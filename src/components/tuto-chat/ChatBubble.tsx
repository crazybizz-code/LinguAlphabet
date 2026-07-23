import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/tuto-chat/types";

export function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-primary",
        )}
      >
        {message.content}
        {streaming && !message.content && (
          <span className="inline-flex items-center gap-1" aria-label="Tuto is thinking">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary" />
          </span>
        )}
      </div>
    </div>
  );
}
