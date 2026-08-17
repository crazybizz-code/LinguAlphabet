import { Headphones, Info } from "lucide-react";

interface ListeningInstructionsProps {
  sectionInstruction?: string | null;
  audioInstruction?: string | null;
}

export function ListeningInstructions({ sectionInstruction, audioInstruction }: ListeningInstructionsProps) {
  const instruction =
    sectionInstruction ?? "Play the audio below. You can only listen once. Answer the questions after the audio ends.";
  const caption =
    audioInstruction ?? "The recording can only be played once. There is no pause, rewind, or replay.";
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-primary">
          <Headphones className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Listening instructions</p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-text-primary">{instruction}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
            {caption}
          </p>
        </div>
      </div>
    </div>
  );
}
