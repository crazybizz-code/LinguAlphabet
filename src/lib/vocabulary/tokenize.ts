export interface TextToken {
  text: string;
  isWord: boolean;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/**
 * Splits text into clickable word tokens plus the punctuation/whitespace
 * between them, preserving the exact original string when rejoined. Used
 * wherever tappable-word lookup is needed — content-type agnostic (plain
 * string in, no knowledge of podcasts/articles/etc), so any future content
 * type's body text can reuse this exact function.
 */
export function tokenizeWords(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(WORD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: text.slice(lastIndex, index), isWord: false });
    tokens.push({ text: match[0], isWord: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex), isWord: false });

  return tokens;
}
