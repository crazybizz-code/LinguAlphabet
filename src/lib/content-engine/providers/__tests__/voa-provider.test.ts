import { describe, it, expect } from "vitest";
import { parseVoaFeed, parseItunesDuration, VOA_ATTRIBUTION, VOA_LICENCE } from "../voa-provider";
import { getAdapter } from "../../adapters/registry";
import { runQualityGate } from "../../publishing";
import { resolveTranscript } from "../../transcripts/resolve";

const SCRIPT = Array.from(
  { length: 60 },
  (_, i) => `Host: Sentence number ${i} about coral reefs, ocean temperature and recovery over time.`,
).join(" ");

function feed(itemXml: string) {
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${itemXml}</channel></rss>`;
}

const EPISODE = feed(`
  <item>
    <title>How Coral Reefs Recover</title>
    <link>https://learningenglish.voanews.com/a/coral/123.html</link>
    <guid>voa-coral-123</guid>
    <pubDate>Tue, 15 Jul 2026 12:00:00 GMT</pubDate>
    <description>A short look at how reefs bounce back.</description>
    <content:encoded><![CDATA[<p>${SCRIPT}</p>]]></content:encoded>
    <itunes:duration>5:12</itunes:duration>
    <enclosure url="https://av.voanews.com/coral-123.mp3" type="audio/mpeg" length="12000000"/>
  </item>`);

describe("parseItunesDuration", () => {
  it("parses bare seconds and clock formats", () => {
    expect(parseItunesDuration("1830")).toBe(1830);
    expect(parseItunesDuration("30:30")).toBe(1830);
    expect(parseItunesDuration("1:02:15")).toBe(3735);
  });

  it("returns null for unusable values so the gate rejects rather than publishing a 0-second episode", () => {
    expect(parseItunesDuration(undefined)).toBeNull();
    expect(parseItunesDuration("0")).toBeNull();
    expect(parseItunesDuration("soon")).toBeNull();
  });
});

describe("parseVoaFeed", () => {
  it("extracts the fields an episode is made of", () => {
    const [item] = parseVoaFeed(EPISODE);
    expect(item.externalId).toBe("voa-coral-123");
    expect(item.title).toBe("How Coral Reefs Recover");
    expect(item.url).toBe("https://learningenglish.voanews.com/a/coral/123.html");
    expect(item.audio).toEqual({ url: "https://av.voanews.com/coral-123.mp3", durationSeconds: 312 });
    expect(item.publishedAt).toBe("Tue, 15 Jul 2026 12:00:00 GMT");
  });

  it("stamps licence, attribution and provenance from the source rather than guessing per item", () => {
    const [item] = parseVoaFeed(EPISODE);
    expect(item.licence).toBe(VOA_LICENCE);
    expect(item.attribution).toBe(VOA_ATTRIBUTION);
    expect(item.transcriptProvenance).toBe("publisher");
  });

  it("carries the script as a transcript reference, not as an asserted transcript", () => {
    const [item] = parseVoaFeed(EPISODE);
    expect(item.body).toBe("");
    expect(item.transcriptRef).toMatchObject({ kind: "inline" });
  });

  it("skips a text-only post with no enclosure instead of failing the run", () => {
    expect(parseVoaFeed(feed("<item><title>Just a post</title><guid>x</guid></item>"))).toHaveLength(0);
  });

  it("skips a non-audio enclosure", () => {
    const video = feed(`<item><title>V</title><guid>v</guid><itunes:duration>60</itunes:duration>
      <enclosure url="https://av.voanews.com/v.mp4" type="video/mp4"/></item>`);
    expect(parseVoaFeed(video)).toHaveLength(0);
  });

  it("skips an episode with no usable duration", () => {
    const noDuration = feed(`<item><title>N</title><guid>n</guid>
      <enclosure url="https://av.voanews.com/n.mp3" type="audio/mpeg"/></item>`);
    expect(parseVoaFeed(noDuration)).toHaveLength(0);
  });

  it("ignores a teaser too short to be a transcript", () => {
    const teaser = feed(`<item><title>T</title><guid>t</guid><itunes:duration>600</itunes:duration>
      <content:encoded><![CDATA[<p>Listen to today's story.</p>]]></content:encoded>
      <enclosure url="https://av.voanews.com/t.mp3" type="audio/mpeg"/></item>`);
    expect(parseVoaFeed(teaser)[0].transcriptRef).toBeUndefined();
  });
});

describe("VOA episode through the unified engine", () => {
  it("resolves, adapts and passes the quality gate", async () => {
    const [raw] = parseVoaFeed(EPISODE);

    const transcript = await resolveTranscript(raw);
    expect(transcript).not.toBeNull();

    const adapter = getAdapter("podcast");
    expect(adapter).toBeDefined();
    const draft = adapter!(raw, { transcript: transcript! });

    expect(draft.contentType).toBe("podcast");
    expect(draft.detailsTable).toBe("podcast_details");
    expect(draft.detailsRow.audio_url).toBe("https://av.voanews.com/coral-123.mp3");
    expect(draft.detailsRow.licence).toBe(VOA_LICENCE);
    expect(draft.detailsRow.attribution).toBe(VOA_ATTRIBUTION);
    expect(draft.detailsRow.transcript_provenance).toBe("publisher");
    expect(draft.detailsRow.source_url).toBe("https://learningenglish.voanews.com/a/coral/123.html");
    expect(draft.detailsRow.transcript_hash).toMatch(/^[a-f0-9]{64}$/);

    // The pipeline fills these post-enrichment; the gate needs them present.
    const gated = runQualityGate({ ...draft, cefrLevelMin: "B1", cefrLevelMax: "B2", topics: ["Science"], estimatedTimeMinutes: 6 });
    expect(gated.reasons).toEqual([]);
    expect(gated.passed).toBe(true);
  });

  it("gives the same content hash to the same episode under a different audio URL", async () => {
    const [raw] = parseVoaFeed(EPISODE);
    const moved = {
      ...raw,
      externalId: "voa-coral-123-reissue",
      audio: { url: "https://av.voanews.com/coral-123-v2.mp3", durationSeconds: 312 },
    };
    const transcript = await resolveTranscript(raw);
    const adapter = getAdapter("podcast")!;

    const a = adapter(raw, { transcript: transcript! });
    const b = adapter(moved, { transcript: transcript! });

    // Different ids (the URL changed) but the SAME transcript hash, which
    // is what stops the duplicate reaching learners.
    expect(a.id).not.toBe(b.id);
    expect(a.detailsRow.transcript_hash).toBe(b.detailsRow.transcript_hash);
  });
});

describe("adapter registry", () => {
  it("routes both content types", () => {
    expect(getAdapter("article")).toBeDefined();
    expect(getAdapter("podcast")).toBeDefined();
  });

  it("has no adapter for a type nobody implemented yet", () => {
    expect(getAdapter("video")).toBeUndefined();
  });
});
