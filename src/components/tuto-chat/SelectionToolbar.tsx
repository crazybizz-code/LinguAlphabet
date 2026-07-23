import { MessageCircleQuestion, Languages, Wand2 } from "lucide-react";

export interface SelectionToolbarProps {
  /** Viewport coordinates (from the selection's bounding rect) — the toolbar is positioned fixed, centered above this point. */
  position: { top: number; left: number };
  onExplain: () => void;
  onTranslate: () => void;
  onSimplify: () => void;
}

/**
 * The floating action bar that appears above a text selection while
 * reading an article — the same "select text, get a small action menu"
 * pattern readers already know from Kindle/Medium/iOS text selection,
 * kept deliberately minimal (three icon buttons, no labels-as-default-
 * clutter) per design-system.md's "no visual noise" bar.
 */
export function SelectionToolbar({ position, onExplain, onTranslate, onSimplify }: SelectionToolbarProps) {
  return (
    <div
      className="fixed z-40 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border border-border bg-bg-card p-1.5 shadow-lg"
      style={{ top: position.top - 8, left: position.left }}
    >
      <button
        type="button"
        onClick={onExplain}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-muted"
      >
        <MessageCircleQuestion className="h-4 w-4 text-primary" aria-hidden="true" />
        Explain
      </button>
      <button
        type="button"
        onClick={onTranslate}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-muted"
      >
        <Languages className="h-4 w-4 text-primary" aria-hidden="true" />
        Translate
      </button>
      <button
        type="button"
        onClick={onSimplify}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-muted"
      >
        <Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />
        Simplify
      </button>
    </div>
  );
}
