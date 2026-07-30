import { describe, it, expect } from "vitest";
import { pickLongestBody, rssProvider } from "../rss-provider";

describe("pickLongestBody", () => {
  it("prefers content:encoded when it holds the full article", () => {
    const body = pickLongestBody({
      contentEncoded: `<p>${"full article text ".repeat(50)}</p>`,
      contentSnippet: "short teaser",
    });
    expect(body.length).toBeGreaterThan(200);
    expect(body).not.toBe("short teaser");
  });

  it("takes the longest field regardless of which one it is — some feeds put the teaser in content:encoded", () => {
    const body = pickLongestBody({
      contentEncoded: "<p>teaser</p>",
      description: `<p>${"the real full body ".repeat(50)}</p>`,
    });
    expect(body).toContain("the real full body");
  });

  it("strips tags, scripts, and styles rather than passing markup downstream", () => {
    const body = pickLongestBody({
      content: `<style>.a{color:red}</style><script>evil()</script><p>Hello&nbsp;world</p>`,
    });
    expect(body).toBe("Hello world");
  });

  it("returns an empty string when the item carries no text at all", () => {
    expect(pickLongestBody({ title: "no body" })).toBe("");
  });
});

describe("rssProvider config validation", () => {
  it("rejects a missing feedUrl as a configuration error", async () => {
    await expect(rssProvider.fetchRawItems({})).rejects.toThrow(/no real feedUrl configured/i);
  });

  it("rejects the literal <FEED_URL> placeholder still present on several seeded rows", async () => {
    await expect(rssProvider.fetchRawItems({ feedUrl: "<FEED_URL>" })).rejects.toThrow(/no real feedUrl configured/i);
  });

  it("is registered under the id every multi-source content_sources row points at", () => {
    expect(rssProvider.id).toBe("rss");
    expect(rssProvider.contentType).toBe("article");
  });
});
