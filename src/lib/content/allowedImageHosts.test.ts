import { describe, it, expect } from "vitest";
import { isAllowedImageHost } from "./allowedImageHosts";

/**
 * This function's contract CHANGED: it used to be a hand-maintained
 * hostname allowlist, which silently replaced every real photo from any
 * newly-added content source with the branded fallback. It is now a
 * structural "could this render at all" check. These tests pin the new
 * contract, especially the part that matters for multi-source: an
 * unfamiliar host must be allowed through.
 */
describe("isAllowedImageHost", () => {
  it("allows an arbitrary https host — a new content source must not need a code change to show its photos", () => {
    expect(isAllowedImageHost("https://cdn.some-new-source.example.org/photo.jpg")).toBe(true);
    expect(isAllowedImageHost("https://images.nasa.gov/a.jpg")).toBe(true);
  });

  it("still allows the hosts the old hardcoded list covered", () => {
    expect(isAllowedImageHost("https://images.theconversation.com/files/1/x.jpg")).toBe(true);
    expect(isAllowedImageHost("https://images.unsplash.com/photo-1")).toBe(true);
  });

  it("rejects http, which next/image cannot render under an https-only remotePattern", () => {
    expect(isAllowedImageHost("http://cdn.example.com/a.jpg")).toBe(false);
  });

  it("rejects tracking pixels that pre-date ingestion-time validation", () => {
    expect(isAllowedImageHost("https://counter.theconversation.com/content/1/count.gif")).toBe(false);
    expect(isAllowedImageHost("https://www.google-analytics.com/collect.gif")).toBe(false);
  });

  it("rejects empty and unparseable values instead of throwing", () => {
    expect(isAllowedImageHost("")).toBe(false);
    expect(isAllowedImageHost("not a url")).toBe(false);
    expect(isAllowedImageHost("//protocol-relative.example.com/a.jpg")).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isAllowedImageHost("data:image/gif;base64,R0lGOD")).toBe(false);
    expect(isAllowedImageHost("file:///etc/passwd")).toBe(false);
  });
});
