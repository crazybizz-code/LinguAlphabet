import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Markdown → React renderer for Tuto's replies. Hand-rolled rather than a
 * markdown library: every construct here is a tolerant scan over literal
 * syntax, never an HTML parse, so there's no injection surface, and every
 * scan is designed to degrade gracefully on a truncated/mid-stream string
 * (an unclosed ``` fence, an unclosed [link](, a table whose separator
 * row hasn't arrived yet) — a partial match just renders as plain text
 * until the rest streams in, it never throws and never produces broken
 * markup. Tuto's own system prompt (FORMATTING_RULES, src/ai/prompts/
 * tuto/sections.ts) keeps normal replies to plain conversational text and
 * the occasional list — headings/tables/code/links are supported here for
 * robustness (whatever the model does occasionally reach for renders
 * properly) and future modes, not because Tuto is being encouraged to
 * write document-style replies.
 */

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `md-${keySeed}`;
}

const INLINE_PATTERN = /(\*\*(?:[^*]|\*(?!\*))+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*]+\*|_[^_]+_)/g;

/** Only these schemes are ever rendered as a real, clickable `<a>` — anything else (including `javascript:`) falls back to plain text, same defensive posture as the rest of this file's "no HTML is ever parsed" stance. */
function isSafeLinkUrl(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url);
}

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
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = linkMatch?.[1] ?? token;
      const url = linkMatch?.[2] ?? "";
      if (url && isSafeLinkUrl(url)) {
        nodes.push(
          <a
            key={nextKey()}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    } else {
      nodes.push(<em key={nextKey()}>{token.slice(1, -1)}</em>);
    }
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const FENCE_PATTERN = /^```(.*)$/;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+\.\s+/;
const UNORDERED_ITEM_PATTERN = /^[-*]\s+/;
const BLOCKQUOTE_PATTERN = /^>\s?/;
/** A GFM-style table separator row: `| --- | :--- | ---: |` (leading/trailing pipes optional). */
const TABLE_SEPARATOR_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function isBlockStart(line: string): boolean {
  return (
    FENCE_PATTERN.test(line) ||
    HEADING_PATTERN.test(line) ||
    ORDERED_ITEM_PATTERN.test(line) ||
    UNORDERED_ITEM_PATTERN.test(line) ||
    BLOCKQUOTE_PATTERN.test(line)
  );
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

const HEADING_SIZE_CLASS: Record<number, string> = {
  1: "text-base font-bold",
  2: "text-base font-bold",
  3: "text-sm font-bold",
  4: "text-sm font-bold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold",
};

/**
 * Renders a (possibly mid-reveal, truncated) markdown string block by
 * block. Line-based, not the old naive "split on blank lines" approach —
 * a fenced code block can legitimately contain blank lines, so blocks are
 * scanned in source order instead of pre-split.
 */
export function renderTutoMarkdown(source: string): ReactNode {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i += 1;
      continue;
    }

    // Fenced code block — tolerant of a fence that hasn't closed yet
    // (still streaming): everything through the end of the text becomes
    // the code block's content.
    const fenceMatch = FENCE_PATTERN.exec(lines[i]);
    if (fenceMatch) {
      const lang = fenceMatch[1].trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_PATTERN.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume the closing fence, if it arrived
      blocks.push(
        <div key={nextKey()} className="overflow-x-auto rounded-xl bg-bg-card">
          {lang && <p className="border-b border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{lang}</p>}
          <pre className="px-3 py-2 text-[0.85em]">
            <code className="font-mono">{codeLines.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }

    // Blockquote — consecutive `>`-prefixed lines.
    if (BLOCKQUOTE_PATTERN.test(lines[i])) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && BLOCKQUOTE_PATTERN.test(lines[i])) {
        quoteLines.push(lines[i].replace(BLOCKQUOTE_PATTERN, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={nextKey()} className="border-l-2 border-border pl-3 text-text-secondary italic">
          {quoteLines.map((line, index) => (
            <span key={nextKey()}>
              {renderInline(line)}
              {index < quoteLines.length - 1 && <br />}
            </span>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Table — only recognized once its separator row has actually
    // arrived; until then the header line just renders as a plain
    // paragraph (falls through below), flipping to a real table the
    // moment the rest streams in.
    if (lines[i].includes("|") && i + 1 < lines.length && TABLE_SEPARATOR_PATTERN.test(lines[i + 1])) {
      const headerCells = splitTableRow(lines[i]);
      i += 2; // header + separator
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        bodyRows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={nextKey()} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[0.9em]">
            <thead>
              <tr>
                {headerCells.map((cell) => (
                  <th key={nextKey()} className="border-b border-border px-2 py-1 font-semibold">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row) => (
                <tr key={nextKey()}>
                  {row.map((cell) => (
                    <td key={nextKey()} className="border-b border-border/60 px-2 py-1">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Heading
    const headingMatch = HEADING_PATTERN.exec(lines[i]);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        <p key={nextKey()} className={HEADING_SIZE_CLASS[level]}>
          {renderInline(headingMatch[2])}
        </p>,
      );
      i += 1;
      continue;
    }

    // Ordered/unordered list — consecutive lines of the SAME list type.
    if (ORDERED_ITEM_PATTERN.test(lines[i]) || UNORDERED_ITEM_PATTERN.test(lines[i])) {
      const isOrdered = ORDERED_ITEM_PATTERN.test(lines[i]);
      const pattern = isOrdered ? ORDERED_ITEM_PATTERN : UNORDERED_ITEM_PATTERN;
      const itemLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && pattern.test(lines[i])) {
        itemLines.push(lines[i].replace(pattern, ""));
        i += 1;
      }
      const ListTag = isOrdered ? "ol" : "ul";
      blocks.push(
        <ListTag key={nextKey()} className={cn("space-y-1 pl-5", isOrdered ? "list-decimal" : "list-disc")}>
          {itemLines.map((line) => (
            <li key={nextKey()}>{renderInline(line)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Paragraph — consume lines until a blank line or the start of
    // another block type, so a list/heading that follows directly (no
    // blank-line separator) still ends the paragraph correctly.
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={nextKey()}>
        {paraLines.map((line, index) => (
          <span key={nextKey()}>
            {renderInline(line)}
            {index < paraLines.length - 1 && <br />}
          </span>
        ))}
      </p>,
    );
  }

  return <div className="space-y-2">{blocks}</div>;
}
