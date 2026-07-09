"use client";

import { tokenizeWords } from "@/lib/vocabulary/tokenize";

export interface ClickableTextProps {
  text: string;
  onWordClick: (word: string) => void;
  className?: string;
}

/**
 * Renders text with every word individually tappable — content-type
 * agnostic (plain string + callback, no podcast/article/etc coupling), so
 * Podcasts' transcript today and any future Article/Story/Video body text
 * can reuse this exact component. Real <button> elements, not styled
 * <span onClick>, so word lookup stays keyboard-accessible.
 */
export function ClickableText({ text, onWordClick, className }: ClickableTextProps) {
  const tokens = tokenizeWords(text);

  // TEMPORARY: runtime trace instrumentation for the transcript/dictionary
  // bug report — remove once the failing link is identified.
  console.log("[TRACE:ClickableText] render", {
    textSample: text.slice(0, 40),
    tokenCount: tokens.length,
    wordTokenCount: tokens.filter((t) => t.isWord).length,
  });

  return (
    <span className={className}>
      {tokens.map((token, index) =>
        token.isWord ? (
          <button
            key={index}
            type="button"
            onClick={() => {
              console.log("[TRACE:ClickableText] button clicked:", token.text);
              onWordClick(token.text);
            }}
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
