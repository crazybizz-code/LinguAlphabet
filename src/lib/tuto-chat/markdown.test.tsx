import { describe, it, expect } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { renderTutoMarkdown } from "./markdown";

/** Walks a rendered element tree collecting every host-element type name encountered (e.g. "table", "pre", "a") — the "node" vitest environment has no DOM, so tests inspect the created element graph directly rather than an actual render. */
function collectTypes(node: ReactNode, types: Set<string> = new Set()): Set<string> {
  if (node === null || node === undefined || typeof node === "boolean") return types;
  if (Array.isArray(node)) {
    node.forEach((child) => collectTypes(child, types));
    return types;
  }
  if (typeof node === "string" || typeof node === "number") return types;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "string") types.add(element.type);
  collectTypes(element.props?.children, types);
  return types;
}

/** Flattens a rendered element tree to its visible text, ignoring markup — used to assert content survived a round trip through the parser. */
function collectText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  const element = node as ReactElement<{ children?: ReactNode }>;
  return collectText(element.props?.children);
}

describe("renderTutoMarkdown", () => {
  it("renders a plain paragraph", () => {
    const tree = renderTutoMarkdown("Just a normal sentence.");
    expect(collectText(tree)).toBe("Just a normal sentence.");
    expect(collectTypes(tree).has("p")).toBe(true);
  });

  it("renders bold, italic, and inline code", () => {
    const tree = renderTutoMarkdown("Use **present perfect** or *simple past*, e.g. `have visited`.");
    const types = collectTypes(tree);
    expect(types.has("strong")).toBe(true);
    expect(types.has("em")).toBe(true);
    expect(types.has("code")).toBe(true);
    expect(collectText(tree)).toContain("present perfect");
  });

  it("renders an unordered list", () => {
    const tree = renderTutoMarkdown("Try these:\n- apples\n- oranges\n- pears");
    const types = collectTypes(tree);
    expect(types.has("ul")).toBe(true);
    expect(types.has("li")).toBe(true);
    expect(collectText(tree)).toContain("oranges");
  });

  it("renders an ordered list", () => {
    const tree = renderTutoMarkdown("1. First step\n2. Second step\n3. Third step");
    const types = collectTypes(tree);
    expect(types.has("ol")).toBe(true);
    expect(collectText(tree)).toContain("Second step");
  });

  it("renders headings at a restrained size, never a giant one", () => {
    const tree = renderTutoMarkdown("# Grammar Point\n\nSome explanation.");
    expect(collectText(tree)).toContain("Grammar Point");
    // Headings degrade to a styled <p>, not a real <h1>, so a heading in a
    // small chat bubble never looks like a rendered webpage.
    expect(collectTypes(tree).has("h1")).toBe(false);
  });

  it("renders a fenced code block, including its language tag", () => {
    const tree = renderTutoMarkdown("Here's an example:\n\n```js\nconst x = 1;\n```");
    const types = collectTypes(tree);
    expect(types.has("pre")).toBe(true);
    expect(types.has("code")).toBe(true);
    expect(collectText(tree)).toContain("const x = 1;");
    expect(collectText(tree)).toContain("js");
  });

  it("tolerates an unclosed code fence (mid-stream) without throwing", () => {
    const tree = renderTutoMarkdown("```\nstill typing this out");
    expect(() => collectText(tree)).not.toThrow();
    expect(collectText(tree)).toContain("still typing this out");
  });

  it("preserves blank lines inside a fenced code block instead of splitting it", () => {
    const tree = renderTutoMarkdown("```\nline one\n\nline two\n```");
    const text = collectText(tree);
    expect(text).toContain("line one");
    expect(text).toContain("line two");
    // Exactly one code block, not two split by the blank line.
    let preCount = 0;
    (function count(node: ReactNode) {
      if (node && typeof node === "object" && !Array.isArray(node)) {
        const el = node as ReactElement<{ children?: ReactNode }>;
        if (el.type === "pre") preCount += 1;
        count(el.props?.children);
      } else if (Array.isArray(node)) {
        node.forEach(count);
      }
    })(tree);
    expect(preCount).toBe(1);
  });

  it("renders a GFM table once its separator row has arrived", () => {
    const tree = renderTutoMarkdown("| Tense | Example |\n| --- | --- |\n| Present perfect | I have visited |");
    const types = collectTypes(tree);
    expect(types.has("table")).toBe(true);
    expect(types.has("thead")).toBe(true);
    expect(types.has("tbody")).toBe(true);
    expect(collectText(tree)).toContain("Present perfect");
  });

  it("does not render a table without a separator row (falls back to a paragraph)", () => {
    const tree = renderTutoMarkdown("| Tense | Example |\nsome unrelated text");
    expect(collectTypes(tree).has("table")).toBe(false);
  });

  it("renders a blockquote", () => {
    const tree = renderTutoMarkdown("> You said: I go to school yesterday.");
    expect(collectTypes(tree).has("blockquote")).toBe(true);
    expect(collectText(tree)).toContain("I go to school yesterday");
  });

  it("renders a safe http(s) link as a real anchor", () => {
    const tree = renderTutoMarkdown("See [the guide](https://example.com/guide) for more.");
    expect(collectTypes(tree).has("a")).toBe(true);
    expect(collectText(tree)).toContain("the guide");
  });

  it("never renders an unsafe link scheme as a clickable anchor", () => {
    const tree = renderTutoMarkdown("Click [here](javascript:alert(1)) now.");
    expect(collectTypes(tree).has("a")).toBe(false);
    expect(collectText(tree)).toContain("here");
  });

  it("tolerates a truncated, unclosed link mid-stream", () => {
    const tree = renderTutoMarkdown("Check out [this guide](https://exa");
    expect(() => collectText(tree)).not.toThrow();
    expect(collectText(tree)).toContain("this guide");
  });

  it("ends a paragraph where a list starts even without a blank line", () => {
    const tree = renderTutoMarkdown("Try these:\n- one\n- two");
    const types = collectTypes(tree);
    expect(types.has("p")).toBe(true);
    expect(types.has("ul")).toBe(true);
    expect(collectText(tree)).toContain("Try these:");
    expect(collectText(tree)).toContain("one");
  });

  it("never throws on an empty string", () => {
    expect(() => renderTutoMarkdown("")).not.toThrow();
  });
});
