"use client";

import type { ReactNode } from "react";
import { EditSheet } from "@/components/profile/EditSheet";
import { TutoChatPanel, type TutoChatEmptyState } from "./TutoChatPanel";
import type { ThinkingFocus } from "./ThinkingTimeline";
import type { ChatMessage } from "@/lib/tuto-chat/types";
import type { ChatOrchestratorAction } from "@/lib/tuto-chat/streamChatCompletion";
import type { TutoChatStatus } from "@/hooks/useTutoChat";
import type { CefrLevel } from "@/ai/context";

export interface TutoChatSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  messages: ChatMessage[];
  status: TutoChatStatus;
  error: string | null;
  onSend: (text: string) => void;
  header?: ReactNode;
  placeholder?: string;
  thinkingFocus?: ThinkingFocus;
  learnerLevel?: CefrLevel | null;
  emptyState?: TutoChatEmptyState;
  onRetry?: () => void;
  orchestratorAction?: ChatOrchestratorAction | null;
}

/** Ask-Tuto-about-the-article and text-selection-action results — the same bottom-sheet chrome as every other sheet in the app, housing a TutoChatPanel. */
export function TutoChatSheet({ open, title, onClose, ...panelProps }: TutoChatSheetProps) {
  return (
    <EditSheet open={open} title={title} onClose={onClose}>
      <TutoChatPanel {...panelProps} />
    </EditSheet>
  );
}
