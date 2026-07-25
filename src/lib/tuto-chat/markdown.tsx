import type { ReactNode } from "react";

/**
 * Minimal, safe markdown → React renderer for Tuto's replies (Sprint UX-1).
 * Deliberately small: Tuto's own system prompt (FORMATTING_RULES,
 * src/ai/prompts/tuto/sections.ts) avoids headings, tables, and heavy
 * formatting, so only what it actually produces is handled — paragraphs,
 * bullet lists, bold, italic, inline code. No HTML is ever parsed from
 * the source; this only recognizes literal markdown syntax and emits
 * React elements directly, so there's no injection surface.
 */

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `md-${keySeed}`;
}

const INLINE_PATTERN = /(\*\*(?:[^*]|\*(?!\*))+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={nextKey()}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={nextKey()} className="rounded bg-bg-card px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={nextKey()}>{token.slice(1, -1)}</em>);
    }
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/**
 * Renders a (possibly mid-reveal, truncated) markdown string. A truncated
 * `**bold` with no closing marker simply renders as literal asterisks
 * until the closing marker arrives — never throws, never produces broken
 * markup, since this is a tolerant scan, not a strict parser.
 */
export function renderTutoMarkdown(source: string): ReactNode {
  const blocks = source.split(/\n{2,}/).filter((block) => block.length > 0);

  return (
    <div className="space-y-2">
      {blocks.map((block) => {
        const lines = block.split("\n").filter((line) => line.length > 0);
        const isList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));

        if (isList) {
          return (
            <ul key={nextKey()} className="list-disc space-y-1 pl-5">
              {lines.map((line) => (
                <li key={nextKey()}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={nextKey()}>
            {lines.map((line, i) => (
              <span key={nextKey()}>
                {renderInline(line)}
                {i < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
