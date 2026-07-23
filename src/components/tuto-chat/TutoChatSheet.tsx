"use client";

import type { ReactNode } from "react";
import { EditSheet } from "@/components/profile/EditSheet";
import { TutoChatPanel } from "./TutoChatPanel";
import type { ChatMessage } from "@/lib/tuto-chat/types";
import type { TutoChatStatus } from "@/hooks/useTutoChat";

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
}

/** Ask-Tuto-about-the-article and text-selection-action results — the same bottom-sheet chrome as every other sheet in the app, housing a TutoChatPanel. */
export function TutoChatSheet({ open, title, onClose, ...panelProps }: TutoChatSheetProps) {
  return (
    <EditSheet open={open} title={title} onClose={onClose}>
      <TutoChatPanel {...panelProps} />
    </EditSheet>
  );
}
