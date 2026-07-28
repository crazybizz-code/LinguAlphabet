import { describe, it, expect } from "vitest";
import { extractQuickActions } from "./quick-actions";

describe("extractQuickActions", () => {
  it("strips the trailing actions line and parses the array", () => {
    const raw = 'The present perfect connects the past to now.\n<!--ACTIONS:["Give an example","Quiz me"]-->';

    const { content, quickActions } = extractQuickActions(raw);

    expect(content).toBe("The present perfect connects the past to now.");
    expect(quickActions).toEqual(["Give an example", "Quiz me"]);
  });

  it("returns the content unchanged with no quick actions when the line is missing", () => {
    const raw = "Just a plain reply with no trailing line at all.";

    const { content, quickActions } = extractQuickActions(raw);

    expect(content).toBe(raw);
    expect(quickActions).toEqual([]);
  });

  it("degrades to zero quick actions on malformed JSON, without losing the reply", () => {
    const raw = "A real reply.\n<!--ACTIONS:[not valid json-->";

    const { content, quickActions } = extractQuickActions(raw);

    expect(content).toBe(raw); // the malformed line doesn't match the pattern, so nothing is stripped -- never silently mangle real content
    expect(quickActions).toEqual([]);
  });

  it("caps at 4 actions and drops non-string entries", () => {
    const raw = '**Reply.**\n<!--ACTIONS:["One","Two","Three","Four","Five",42,null]-->';

    const { quickActions } = extractQuickActions(raw);

    expect(quickActions).toEqual(["One", "Two", "Three", "Four"]);
  });

  it("truncates an overly long action label rather than rejecting the whole line", () => {
    const longLabel = "A".repeat(100);
    const raw = `Reply.\n<!--ACTIONS:["${longLabel}"]-->`;

    const { quickActions } = extractQuickActions(raw);

    expect(quickActions[0].length).toBe(40);
  });

  it("never leaves the raw delimiter visible in content, even with surrounding blank lines", () => {
    const raw = 'Reply here.\n\n\n<!--ACTIONS:["A"]-->\n\n';

    const { content } = extractQuickActions(raw);

    expect(content).not.toContain("<!--ACTIONS");
    expect(content).toBe("Reply here.");
  });
});
