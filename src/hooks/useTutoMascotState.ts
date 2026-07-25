"use client";

import { useEffect, useRef, useState } from "react";
import type { TutoChatStatus } from "./useTutoChat";
import type { ChatMessage } from "@/lib/tuto-chat/types";

export type MascotState = "idle" | "thinking" | "teaching" | "waiting" | "success" | "error";

const SUCCESS_DISPLAY_MS = 1400;

/**
 * Sprint UX-1 (Living Tuto): derives a small, presentational state machine
 * from the chat hook's own status + message list — no new data source, no
 * backend visibility needed. "success" is transient: it appears the
 * instant a turn finishes successfully, then falls back to "waiting"
 * after a beat, the same way a person's expression settles after
 * finishing a thought.
 */
export function useTutoMascotState(status: TutoChatStatus, messages: ChatMessage[]): MascotState {
  const [showSuccess, setShowSuccess] = useState(false);
  const prevStatusRef = useRef<TutoChatStatus>(status);

  useEffect(() => {
    const previous = prevStatusRef.current;
    prevStatusRef.current = status;

    if (previous === "streaming" && status === "idle") {
      setShowSuccess(true);
      const timeout = setTimeout(() => setShowSuccess(false), SUCCESS_DISPLAY_MS);
      return () => clearTimeout(timeout);
    }
  }, [status]);

  if (status === "error") return "error";
  if (showSuccess) return "success";

  const lastMessage = messages[messages.length - 1];

  if (status === "streaming") {
    const isEmptyPlaceholder = !lastMessage || lastMessage.role !== "assistant" || lastMessage.content.length === 0;
    return isEmptyPlaceholder ? "thinking" : "teaching";
  }

  if (!lastMessage) return "idle";
  return lastMessage.role === "assistant" ? "waiting" : "idle";
}
