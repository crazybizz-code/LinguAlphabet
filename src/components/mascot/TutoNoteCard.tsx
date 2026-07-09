import { Tuto } from "@/components/mascot/Tuto";
import { cn } from "@/lib/utils";
import type { TutoNote } from "@/lib/tuto/messages";

export interface TutoNoteCardProps {
  note: TutoNote;
  className?: string;
}

/**
 * Shared "Tuto has something to say" card — Home, Progress and Explore
 * each hand-rolled this identically (avatar + quoted message in a
 * bordered card). Each caller keeps its own outer section/motion timing
 * since that varies by screen; only the card itself is shared.
 */
export function TutoNoteCard({ note, className }: TutoNoteCardProps) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-border bg-bg-card p-4", className)}>
      <Tuto pose={note.pose} size="sm" />
      <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">{`“${note.message}”`}</p>
    </div>
  );
}
