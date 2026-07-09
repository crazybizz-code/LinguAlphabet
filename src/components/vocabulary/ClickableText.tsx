"use client";

import { tokenizeWords } from "@/lib/vocabulary/tokenize";

export interface ClickableTextProps {
  text: string;
  onWordClick: (word: string, context: string) => void;
  className?: string;
}

/**
 * Renders text with every word individually tappable — content-type
 * agnostic (plain string + callback, no podcast/article/etc coupling), so
 * Podcasts' transcript today and any future Article/Story/Video body text
 * can reuse this exact component. Real <button> elements, not styled
 * <span onClick>, so word lookup stays keyboard-accessible. The full `text`
 * is passed back alongside the clicked word as disambiguation context for
 * word-sense lookups (e.g. "stress" the noun vs. the verb).
 */
export function ClickableText({ text, onWordClick, className }: ClickableTextProps) {
  const tokens = tokenizeWords(text);

  return (
    <span className={className}>
      {tokens.map((token, index) =>
        token.isWord ? (
          <button
            key={index}
            type="button"
            onClick={() => onWordClick(token.text, text)}
            className="rounded-sm border-0 bg-transparent p-0 font-inherit text-inherit hover:bg-primary-lighter hover:text-primary-dark"
          >
            {token.text}
          </button>
        ) : (
          <span key={index}>{token.text}</span>
        ),
      )}
    </span>
  );
}
