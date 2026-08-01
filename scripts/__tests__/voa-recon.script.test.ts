import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * PARSE VALIDATION FOR scripts/voa-recon.ps1
 *
 * The recon script is an operator diagnostic: it runs on a Windows box,
 * once, at the moment someone needs an answer. A syntax error in it is
 * discovered at exactly the worst time, and that is precisely what
 * happened - the first version failed to parse under Windows PowerShell
 * 5.1 before it made a single request.
 *
 * Two root causes, and this file guards both so neither can come back:
 *
 *   1. ENCODING. Windows PowerShell 5.1 reads a BOM-less .ps1 using the
 *      system ANSI codepage. A UTF-8 em dash (E2 80 94) therefore arrives
 *      as three garbage characters, corrupting the token stream and
 *      cascading into parser errors on later lines. Guarded by asserting
 *      a UTF-8 BOM plus a strictly ASCII body.
 *
 *   2. QUOTING. The attribute regexes have to match both double- and
 *      single-quoted HTML attributes, which used to mean embedding both
 *      quote characters in one PowerShell string literal and escaping
 *      one of them. Guarded by asserting the escape construct is gone,
 *      and by re-deriving every regex from the script's own text and
 *      running it - so the patterns are proved correct on Linux CI,
 *      without a PowerShell host.
 *
 * When a PowerShell host IS available (a Windows dev box, or a runner
 * with pwsh installed), the last test runs the real language parser.
 */

const SCRIPT_PATH = path.resolve(__dirname, "../voa-recon.ps1");
const bytes = readFileSync(SCRIPT_PATH);
const source = bytes.slice(3).toString("ascii");

describe("voa-recon.ps1 encoding", () => {
  it("starts with a UTF-8 BOM so PowerShell 5.1 cannot fall back to the ANSI codepage", () => {
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("contains no byte outside printable ASCII, so ANSI and UTF-8 readings are identical", () => {
    const offenders: string[] = [];
    const body = bytes.slice(3);
    for (let i = 0; i < body.length; i++) {
      const byte = body[i];
      const printable = byte >= 0x20 && byte <= 0x7e;
      const allowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
      if (!printable && !allowedControl) {
        offenders.push(`offset ${i}: 0x${byte.toString(16)}`);
      }
    }
    // Em dashes, curly quotes and ellipses are the usual culprits; they
    // read as mojibake under the ANSI codepage.
    expect(offenders, `Non-ASCII bytes in voa-recon.ps1: ${offenders.slice(0, 5).join(", ")}`).toEqual([]);
  });
});

interface ScannedLiteral {
  line: number;
  value: string;
}

/**
 * Walks the script the way the PowerShell tokenizer does, far enough to
 * pull out every single-quoted string literal and to notice one that
 * never closes.
 *
 * Not a full parser - it only needs to distinguish code, comments,
 * "double-quoted" strings and 'single-quoted' strings, which is exactly
 * the ambiguity the old file got wrong.
 */
function scanSingleQuotedLiterals(): { literals: ScannedLiteral[]; unterminated: string[] } {
  const literals: ScannedLiteral[] = [];
  const unterminated: string[] = [];

  source.split("\n").forEach((line, index) => {
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      if (char === "#") break; // comment: nothing after this is code
      if (char === '"') {
        // Double-quoted string. A backtick escapes the next character.
        i += 1;
        while (i < line.length && line[i] !== '"') i += line[i] === "`" ? 2 : 1;
        i += 1;
      } else if (char === "'") {
        let value = "";
        i += 1;
        let closed = false;
        while (i < line.length) {
          if (line[i] === "'") {
            if (line[i + 1] === "'") {
              // The escape form: '' is one literal apostrophe.
              value += "'";
              i += 2;
              continue;
            }
            closed = true;
            i += 1;
            break;
          }
          value += line[i];
          i += 1;
        }
        if (!closed) unterminated.push(`line ${index + 1}: ${line.trim()}`);
        literals.push({ line: index + 1, value });
      } else {
        i += 1;
      }
    }
  });

  return { literals, unterminated };
}

describe("voa-recon.ps1 quoting", () => {
  it("builds quote characters from codepoints rather than embedding them in regex literals", () => {
    expect(source).toContain("$DQ = [string][char]34");
    expect(source).toContain("$SQ = [string][char]39");
  });

  it("has no single-quoted literal containing a quote character", () => {
    // This is THE invariant. The old file wrote attribute patterns as
    // ["'']alternate["''] - both quote characters inside one literal,
    // one of them escaped. Keeping every literal quote-free means there
    // is nothing left for the 5.1 parser to misread.
    const offenders = scanSingleQuotedLiterals()
      .literals.filter((literal) => /["']/.test(literal.value))
      .map((literal) => `line ${literal.line}: ${literal.value}`);
    expect(offenders, `Quote inside a string literal: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("closes every single-quoted literal on the line it opens", () => {
    // An unterminated literal swallows the rest of the line and cascades
    // into "unexpected token" errors many lines later, far from the cause.
    const { unterminated } = scanSingleQuotedLiterals();
    expect(unterminated, `Unterminated string: ${unterminated.join(" | ")}`).toEqual([]);
  });
});

/**
 * Re-derives a `$reXxx = '...' + $Q + '...'` assignment from the script's
 * own source into a JavaScript RegExp.
 *
 * This is what makes the patterns testable without PowerShell. The
 * expressions are deliberately restricted to single-quoted literals and
 * the four quote variables, so a tiny tokenizer is enough - and if
 * someone writes something more complicated, this throws rather than
 * silently passing.
 */
function derivePattern(name: string): string {
  const lines = source.split("\n");
  const startIndex = lines.findIndex((line) => new RegExp(`^\\s*\\$${name}\\s*=`).test(line));
  if (startIndex === -1) throw new Error(`No assignment for $${name} in voa-recon.ps1`);

  let expression = lines[startIndex].replace(/^\s*\$\w+\s*=\s*/, "").trim();
  let cursor = startIndex;
  // PowerShell continues an expression when the line ends in an operator.
  while (expression.endsWith("+")) {
    cursor += 1;
    if (cursor >= lines.length) throw new Error(`Unterminated expression for $${name}`);
    expression += " " + lines[cursor].trim();
  }

  const VARIABLES: Record<string, string> = {
    DQ: '"',
    SQ: "'",
    Q: `["']`,
    NQ: `[^"']`,
  };

  let out = "";
  let i = 0;
  while (i < expression.length) {
    const char = expression[i];
    if (char === " " || char === "+") {
      i += 1;
    } else if (char === "'") {
      const end = expression.indexOf("'", i + 1);
      if (end === -1) throw new Error(`Unterminated string in $${name}`);
      out += expression.slice(i + 1, end);
      i = end + 1;
    } else if (char === "$") {
      const match = /^\$(\w+)/.exec(expression.slice(i));
      if (!match) throw new Error(`Bad variable reference in $${name}`);
      const value = VARIABLES[match[1]];
      if (value === undefined) throw new Error(`$${name} references unsupported variable $${match[1]}`);
      out += value;
      i += match[0].length;
    } else {
      throw new Error(`Unsupported token '${char}' in $${name} - keep these expressions to literals and $Q/$NQ/$DQ/$SQ`);
    }
  }
  return out;
}

// VOA-shaped markup. Attributes are deliberately a mix of double- and
// single-quoted, because matching both is the entire reason the quote
// character class exists.
const PROGRAM_HTML = `<!doctype html><html><head>
<link rel="alternate" type="application/rss+xml" title="Learning English Podcast" href="/api/zmgpoemtkq">
<link rel='alternate' type='application/atom+xml' title='Atom' href='/api/atom-xyz'>
<link rel="alternate" hreflang="es" href="https://learningenglish.voanews.com/es">
</head><body>
<script>window.CONFIG = {"rssUrl":"https://learningenglish.voanews.com/api/zmgpoemtkq","podcast_feed":"https:\\/\\/learningenglish.voanews.com\\/api\\/epiqbeuvpq","unrelated":"nope"};</script>
<a href="/a/lets-learn-english-lesson-1/8123456.html">Lesson 1</a>
<a href='/a/as-it-is-a-story/7654321.html'>As It Is</a>
<a href="/z/1690">Another zone</a>
</body></html>`;

const EPISODE_HTML = `<!doctype html><html><head>
<meta property="og:title" content="A Real Episode Title">
<meta property='og:description' content='A real description.'>
<meta name="twitter:card" content="summary_large_image">
<meta property="og:audio" content="https://av.voanews.com/clips/2026/01/01/episode.mp3">
<script type="application/ld+json">{"@type":"NewsArticle","headline":"A Real Episode Title"}</script>
</head><body>
<audio src="https://av.voanews.com/clips/2026/01/01/episode.mp3"></audio>
<div class="wsw"><p>First paragraph.</p><p>Second paragraph.</p></div>
</body></html>`;

function matchAll(pattern: string, html: string): RegExpMatchArray[] {
  return [...html.matchAll(new RegExp(pattern, "gi"))];
}

describe("voa-recon.ps1 regexes still capture what the recon is for", () => {
  it("$reLinkTag finds every rel=alternate link, double- or single-quoted", () => {
    const matches = matchAll(derivePattern("reLinkTag"), PROGRAM_HTML);
    expect(matches).toHaveLength(3);
  });

  it("$reType / $reHref / $reTitle read attributes off a matched tag", () => {
    const tags = matchAll(derivePattern("reLinkTag"), PROGRAM_HTML).map((m) => m[0]);
    const type = new RegExp(derivePattern("reType"), "i").exec(tags[1]);
    const href = new RegExp(derivePattern("reHref"), "i").exec(tags[1]);
    const title = new RegExp(derivePattern("reTitle"), "i").exec(tags[1]);
    // The single-quoted tag: the case the old escaping made fragile.
    expect(type?.[1]).toBe("application/atom+xml");
    expect(href?.[1]).toBe("/api/atom-xyz");
    expect(title?.[1]).toBe("Atom");
  });

  it("$reConfig matches feed URLs by KEY, since VOA's feed URLs are opaque", () => {
    const matches = matchAll(derivePattern("reConfig"), PROGRAM_HTML);
    const keys = matches.map((m) => m[1]);
    expect(keys).toContain("rssUrl");
    expect(keys).toContain("podcast_feed");
    expect(keys).not.toContain("unrelated");
    // The value carries no "rss" and no ".xml" - shape-matching would miss it.
    expect(matches.find((m) => m[1] === "rssUrl")?.[2]).toBe(
      "https://learningenglish.voanews.com/api/zmgpoemtkq",
    );
  });

  it("$reEpisode keeps /a/<slug>/<id>.html permalinks and drops zone links", () => {
    const urls = matchAll(derivePattern("reEpisode"), PROGRAM_HTML).map((m) => m[1]);
    expect(urls).toEqual([
      "/a/lets-learn-english-lesson-1/8123456.html",
      "/a/as-it-is-a-story/7654321.html",
    ]);
  });

  it("$reLdJson captures the ld+json payload", () => {
    const match = new RegExp(derivePattern("reLdJson"), "i").exec(EPISODE_HTML);
    expect(JSON.parse(match![1]).headline).toBe("A Real Episode Title");
  });

  it("$reMeta captures og/article/twitter tags in both quote styles", () => {
    const tags = Object.fromEntries(
      matchAll(derivePattern("reMeta"), EPISODE_HTML).map((m) => [m[1], m[2]]),
    );
    expect(tags["og:title"]).toBe("A Real Episode Title");
    expect(tags["og:description"]).toBe("A real description.");
    expect(tags["twitter:card"]).toBe("summary_large_image");
  });

  it("$reMp3 finds the audio URL", () => {
    const urls = matchAll(derivePattern("reMp3"), EPISODE_HTML).map((m) => m[1]);
    expect(urls).toContain("https://av.voanews.com/clips/2026/01/01/episode.mp3");
  });

  it("$reWsw detects the VOA article body wrapper", () => {
    expect(new RegExp(derivePattern("reWsw"), "i").test(EPISODE_HTML)).toBe(true);
  });
});

describe("voa-recon.ps1 report shape", () => {
  // The whole point of the diagnostic is what it brings back. A future
  // edit that quietly drops a field should fail here rather than be
  // discovered when the operator's JSON turns out to be missing it.
  const REQUIRED_FIELDS = [
    "capturedAt",
    "programUrl",
    "programPage",
    "feedLinks",
    "configFeeds",
    "feedProbe",
    "episodeCount",
    "episodeLinks",
    "episode",
    "itemCount",
    "hasEnclosure",
    "hasItunesDuration",
    "hasContentEncoded",
    "firstItemXml",
    "jsonLdCount",
    "jsonLd",
    "openGraph",
    "mp3Urls",
    "hasAudioTag",
    "hasWswBody",
    "paragraphCount",
    "headSnippet",
  ];

  it.each(REQUIRED_FIELDS)("still reports %s", (field) => {
    expect(source).toMatch(new RegExp(`\\b${field}\\s*=`));
  });

  it("still serialises deeply enough for the nested episode object", () => {
    expect(source).toContain("ConvertTo-Json -Depth 8");
  });
});

/** The real thing, when a host exists. Skipped rather than failed elsewhere. */
function findPowerShell(): string | null {
  for (const candidate of ["pwsh", "powershell"]) {
    try {
      execFileSync(candidate, ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore", timeout: 30_000 });
      return candidate;
    } catch {
      // Not installed on this machine; try the next.
    }
  }
  return null;
}

const powerShell = findPowerShell();

describe.skipIf(!powerShell)("voa-recon.ps1 parses under the real PowerShell parser", () => {
  it("produces zero parse errors", () => {
    const command = [
      "$errors = $null",
      `[void][System.Management.Automation.Language.Parser]::ParseFile('${SCRIPT_PATH}', [ref]$null, [ref]$errors)`,
      "if ($errors -and $errors.Count -gt 0) { $errors | ForEach-Object { Write-Output $_.ToString() }; exit 1 }",
      "exit 0",
    ].join("; ");

    let output = "";
    let failed = false;
    try {
      execFileSync(powerShell!, ["-NoProfile", "-NonInteractive", "-Command", command], {
        encoding: "utf8",
        timeout: 60_000,
      });
    } catch (error) {
      failed = true;
      output = String((error as { stdout?: string }).stdout ?? error);
    }
    expect(failed, `PowerShell parse errors:\n${output}`).toBe(false);
  });
});
