"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Passage highlighting for the Reading Mock.
 *
 * Reproduces the BEHAVIOUR documented in docs/reading-ielts-reference-audit.md
 * §6 -- select to apply, click an existing highlight to recolour or remove,
 * clear-all, two colours, a cursor-positioned toolbar clamped to the viewport
 * -- using our own implementation. No code from the reference is copied.
 *
 * Highlights are DOM spans inside the passage container. Because the Reading
 * client hides inactive parts rather than unmounting them, the spans survive
 * part switching for free; nothing needs to be serialised or replayed.
 */

export type HighlightColor = "yellow" | "green";

const HIGHLIGHT_CLASS = "labc-highlight";

interface ToolbarState {
  x: number;
  y: number;
  /** "apply" when text is selected; "edit" when an existing highlight was clicked. */
  mode: "apply" | "edit";
}

/** Moves a highlight span's children back to its parent and removes it, then
 * re-merges the adjacent text nodes so repeated apply/remove cycles cannot
 * fragment the passage text. */
function unwrapHighlight(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
  (parent as Element).normalize?.();
}

interface Props {
  /** Resolves the scrollable passage container whose text may be highlighted.
   * A getter rather than a ref object: the parent holds one ref per Part and
   * must not read `ref.current` during render, so resolution is deferred to
   * effects and event handlers. */
  getContainer: () => HTMLElement | null;
  /** Changes when the active Part changes, so listeners rebind to the new
   * passage container. */
  containerKey: string | number;
  /** Disables highlighting entirely (e.g. after submission). */
  disabled?: boolean;
}

export function PassageHighlighter({ getContainer, containerKey, disabled = false }: Props) {
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [hasHighlights, setHasHighlights] = useState(false);
  const savedRange = useRef<Range | null>(null);
  const targetHighlight = useRef<Element | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const refreshHasHighlights = useCallback(() => {
    const root = getContainer();
    setHasHighlights(!!root && root.querySelectorAll(`.${HIGHLIGHT_CLASS}`).length > 0);
  }, [getContainer]);

  /** Clamps the toolbar inside the viewport; flips below the cursor when it
   * would otherwise sit under the fixed header. */
  const place = useCallback((clientX: number, clientY: number, mode: ToolbarState["mode"]) => {
    const width = toolbarRef.current?.offsetWidth ?? 220;
    const height = toolbarRef.current?.offsetHeight ?? 40;
    let x = clientX - width / 2;
    let y = clientY - height - 12;
    if (x < 8) x = 8;
    if (x + width > window.innerWidth - 8) x = window.innerWidth - width - 8;
    if (y < 72) y = clientY + 16;
    setToolbar({ x, y, mode });
  }, []);

  useEffect(() => {
    if (disabled) return;

    function onMouseUp(event: MouseEvent) {
      const el = getContainer();
      if (!el) return;
      if (toolbarRef.current?.contains(event.target as Node)) return;

      const selection = window.getSelection();
      const clickedHighlight = (event.target as Element | null)?.closest?.(`.${HIGHLIGHT_CLASS}`) ?? null;

      // Clicking an existing highlight with nothing selected: offer recolour/remove.
      if (clickedHighlight && (!selection || selection.isCollapsed)) {
        targetHighlight.current = clickedHighlight;
        savedRange.current = null;
        place(event.clientX, event.clientY, "edit");
        return;
      }

      // A real selection inside the passage: offer the colours.
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        const range = selection.getRangeAt(0);
        if (el.contains(range.commonAncestorContainer)) {
          savedRange.current = range.cloneRange();
          targetHighlight.current = null;
          place(event.clientX, event.clientY, "apply");
          return;
        }
      }
      setToolbar(null);
    }

    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
    // containerKey re-binds the listener when the active Part changes.
  }, [getContainer, containerKey, disabled, place]);

  const apply = useCallback((color: HighlightColor) => {
    const range = savedRange.current;
    if (!range || range.collapsed) { setToolbar(null); return; }
    try {
      const span = document.createElement("span");
      span.className = `${HIGHLIGHT_CLASS} ${HIGHLIGHT_CLASS}--${color}`;
      // extractContents + insertNode fails on a selection that crosses element
      // boundaries unevenly; swallowing that leaves the passage untouched
      // rather than corrupting it.
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch {
      /* selection could not be wrapped cleanly -- passage text left as-is */
    }
    window.getSelection()?.removeAllRanges();
    savedRange.current = null;
    setToolbar(null);
    refreshHasHighlights();
  }, [refreshHasHighlights]);

  const recolor = useCallback((color: HighlightColor) => {
    const target = targetHighlight.current;
    if (target) target.className = `${HIGHLIGHT_CLASS} ${HIGHLIGHT_CLASS}--${color}`;
    targetHighlight.current = null;
    setToolbar(null);
    refreshHasHighlights();
  }, [refreshHasHighlights]);

  const removeOne = useCallback(() => {
    const target = targetHighlight.current;
    if (target) unwrapHighlight(target);
    targetHighlight.current = null;
    setToolbar(null);
    refreshHasHighlights();
  }, [refreshHasHighlights]);

  const clearAll = useCallback(() => {
    getContainer()?.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(unwrapHighlight);
    targetHighlight.current = null;
    savedRange.current = null;
    setToolbar(null);
    refreshHasHighlights();
  }, [getContainer, refreshHasHighlights]);

  if (disabled) return null;

  return (
    <>
      {hasHighlights && (
        <button
          onClick={clearAll}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
        >
          Clear highlights
        </button>
      )}

      {toolbar && (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Highlight text"
          style={{ left: toolbar.x, top: toolbar.y }}
          className="fixed z-[2000] flex items-center gap-1 rounded-xl bg-[#1a1a2e] p-1.5 shadow-xl"
        >
          <button
            aria-label="Highlight yellow"
            onClick={() => (toolbar.mode === "apply" ? apply("yellow") : recolor("yellow"))}
            className="h-6 w-6 rounded-md bg-[#ffeb3b] ring-1 ring-white/20 transition-transform hover:scale-110"
          />
          <button
            aria-label="Highlight green"
            onClick={() => (toolbar.mode === "apply" ? apply("green") : recolor("green"))}
            className="h-6 w-6 rounded-md bg-[#a5d6a7] ring-1 ring-white/20 transition-transform hover:scale-110"
          />
          {toolbar.mode === "edit" && (
            <button
              onClick={removeOne}
              className="ml-1 rounded-md px-2 py-1 text-xs font-semibold text-white/90 transition-colors hover:bg-white/15"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </>
  );
}
