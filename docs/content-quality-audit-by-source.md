# Content Quality Audit — By Source

Status: **audit only — no code changed as part of this document.** This is
the Content Quality phase deliverable following the Content Source
Expansion phase (13 of 15 `docs/content-source-policy.md` APPROVED sources
now enabled). **The Content Engine is frozen per instruction — this
document recommends quality tuning only, never a pipeline redesign or a
new feature.**

## Scope and method — read before the scores

Every enabled source runs through **one shared pipeline**
(`rss-provider.ts` → `ai-processing.ts`'s single Gemini prompt →
`publishing.ts`'s quality gate). `docs/content-quality-audit.md` (the
prior audit) already scored that shared machinery component-by-component;
its findings — the empty-string validation gap, the hardcoded quiz
`type: "mc"`, reading time computed on raw HTML, no CEFR min/max ordering
check, exact-match-only dedup — apply **identically to every source
below**, because it's the same code path. This document does not repeat
that analysis; it builds on it.

What varies **by source** is what that shared pipeline is fed: each
source's actual register (formal/bureaucratic vs. narrative), platform
(clean semantic HTML vs. opaque CMS), topical breadth vs. narrowness, and
translation/authorship characteristics. That's what the per-source scores
below capture — not a re-measurement of the shared code, but how well each
source's real content plays to that code's known strengths and gaps.

**Limitation, stated plainly:** this sandbox has no live Supabase
project, no `GEMINI_API_KEY`, and no network egress to any of these
feeds (all confirmed repeatedly throughout this project). Every score
below is a grounded prediction from (a) direct inspection of the shared
pipeline code, and (b) each source's real, researched content
characteristics (register, platform, feed scope) established during
implementation — not a measurement of actual published article samples.
Treat this as a pre-production risk assessment to guide where a human
spot-check should focus first, not a substitute for reviewing real
published output once live.

Two sources from the 15-source APPROVED list carry no score: **VOA
Learning English** and **National Park Service** were researched and
found to have no confirmable general RSS feed (audio-only zone feeds for
VOA; only per-park pages for NPS) — nothing is ingesting from them, so
there is no content to audit.

---

## Scorecard — all 13 enabled sources

| Source | Extraction | Summary | Vocabulary | Quiz | Reflection | CEFR | Reading time | Dedup | **Avg** |
|---|---|---|---|---|---|---|---|---|---|
| NASA News | 7 | 6 | 6 | 5 | 7 | 5 | 8 | 6 | **6.3** |
| CDC Newsroom | 6 | 6 | 6 | 5 | 7 | 5 | 8 | 7 | **6.3** |
| NOAA / NWS | 7 | 6 | 6 | 5 | 7 | 5 | 8 | 6 | **6.3** |
| USGS | 6 | 6 | 5 | 5 | 6 | 4 | 8 | 7 | **5.9** |
| NIH (NIEHS feed) | 6 | 6 | 5 | 5 | 6 | 4 | 8 | 7 | **5.9** |
| Library of Congress | 7 | 5 | 4 | 4 | 5 | 4 | 8 | 7 | **5.5** |
| Peace Corps | 6 | 5 | 5 | 5 | 5 | 5 | 8 | 7 | **5.8** |
| UK Government (GOV.UK) | 6 | 5 | 5 | 5 | 6 | 4 | 8 | 6 | **5.6** |
| Wikinews | 7 | 6 | 6 | 5 | 7 | 5 | 8 | 6 | **6.3** |
| Global Voices | 5 | 6 | 6 | 5 | 8 | 4 | 8 | 7 | **6.1** |
| European Commission Press Corner | 6 | 5 | 4 | 5 | 4 | 4 | 8 | 6 | **5.3** |
| FEMA | 6 | 6 | 6 | 5 | 7 | 5 | 8 | 6 | **6.1** |
| EPA | 6 | 6 | 6 | 5 | 7 | 5 | 8 | 7 | **6.3** |

*Reading time and Dedup are architecture-level, not source-level, findings
— they use the same code path for every source, so their scores stay
close to the baseline audit's 8/10 and 7/10 regardless of source; minor
variance above reflects only how often each source's extraction falls
back to raw (more HTML-laden) RSS text vs. clean Readability output.*

---

## Weakest sources (in order)

### 1. European Commission Press Corner — 5.3

The lowest score, and the source the original policy research **already
predicted** would score lowest: "EU press releases skew
formal/bureaucratic in register — expect higher CEFR levels (B2–C1) and
possibly less engaging reflection-prompt material than narrative
sources" (`docs/content-source-policy.md`). That prediction plays out
across three dimensions at once:
- **Reflection (4):** institutional press-release content ("the
  Commission adopted a proposal on...") gives Gemini's reflection prompt
  little personal or relatable material to work with — expect generic,
  low-engagement prompts more often here than from any narrative source.
- **Vocabulary (4):** EU-institutional jargon ("trilogue," "comitology,"
  "own resources," named programme acronyms) is accurately extractable
  but not broadly useful vocabulary for a general English learner — the
  same failure mode as Library of Congress below, driven by register
  rather than a code defect.
- **CEFR (4):** dense bureaucratic sentence structure is exactly the
  profile most likely to get pushed toward C1 regardless of a piece's
  actual conceptual difficulty, since CEFR is entirely a single
  unvalidated Gemini judgment (per the baseline audit's §5 finding) with
  nothing to catch register-driven over-leveling.

### 2. Library of Congress — 5.5

Confirmed feed is specifically the **Copyright Office blog** (copyright
law developments, court cases), not general library/history/culture
content the source name implies. This is a **content-scope mismatch**,
not a code defect: the source is correctly licensed and the feed URL is
genuinely confirmed, but "Library of Congress" content in the catalog
will, in practice, mean legal/IP-specific writing.
- **Vocabulary (4)** and **Quiz (4)** suffer for the same reason as EU
  Commission: legal terminology extracts cleanly but isn't broadly useful
  general-English vocabulary, and quiz distractors drawn from legal
  nuance risk being either trivially easy or confusingly technical.
- **Reflection (5):** legal/copyright topics give Gemini's "relate this
  to your own experience" instruction less natural material than a
  volunteer story or a science feature would.

### 3. UK Government (GOV.UK) — 5.6

The confirmed feed (`gov.uk/search/news-and-communications.atom`) is
**cross-department** — it carries announcements from every UK government
department at once, spanning everything from plain-language public
health notices to dense fiscal/regulatory policy releases. Unlike every
other source in this catalog, which has one fairly consistent register,
GOV.UK's actual per-item register will swing widely day to day.
- **CEFR (4):** the min/max range design (already noted as a strength in
  the baseline audit) is a reasonable fit for variance *within* one
  article, but doesn't help when the variance is *across* articles from
  the same feed — a plain-English health notice and a dense fiscal policy
  release could land at very different real difficulty despite going
  through the identical unvalidated single-call judgment.
- **Vocabulary (5)/Reflection (6):** mid-pack — sits between the
  narrative sources and the two bureaucratic-register sources above,
  since only some GOV.UK items skew formal.

### 4. Peace Corps — 5.8

The confirmed feed (`peacecorps.gov/rss/peacecorpsnews/`) is described in
its own search result as **"press releases, media advisories, and
statements from the Office of Press Relations"** — official agency
communications, not the personal volunteer-story blog content the
original policy research anticipated ("AI enrichment compatibility:
Good — volunteer stories are narrative..."). The narrative-story feed
this source was originally scoped for was never independently confirmed
to have its own RSS endpoint; what's actually live is closer to
institutional news.
- **Reflection (5)** and **Vocabulary (5):** press-release register gives
  noticeably less personal, relatable material than the volunteer-story
  content the source was chosen for — a real content-expectation gap
  worth flagging even though nothing about the implementation is wrong.

### 5. USGS and NIH — 5.9 (tied)

Both scored down for the same reason, and neither is a defect so much as
a labeling risk:
- **USGS's CEFR (4):** the confirmed feed (national press releases, not
  the earthquake bulletins) is genuinely the right choice for narrative
  quality, but geology/hydrology terminology ("aquifer depletion,"
  "gravity measurement") is technical enough to plausibly skew CEFR
  estimates upward inconsistently.
- **NIH's scope (reflected across Vocabulary/Reflection at 5/6):** the
  confirmed feed is actually **NIEHS** (one institute, environmental
  health specifically), not an agency-wide NIH feed — no such feed could
  be confirmed. Every article surfaced under the "NIH" source name will,
  in practice, only ever be about environmental health topics. This is
  the same content-scope mismatch as Library of Congress: correctly
  licensed, genuinely confirmed, but narrower than the source's own name
  suggests.

---

## Strongest sources

**NASA News, CDC Newsroom, NOAA/NWS, Wikinews, and EPA all cluster at
6.3** — the common thread is genuinely narrative, accessible-register
content (science/health features, standard news-writing style) with no
scope-narrowing surprise between the source's name and what the feed
actually delivers. Wikinews in particular benefits from clean MediaWiki
semantic HTML (best extraction fit of any source) and a register
deliberately written in neutral, general-audience journalistic style.

**Global Voices (6.1)** is notable for the widest internal spread: its
**Reflection score (8) is the single highest of any source** — genuine
first-person citizen-journalism narrative gives Gemini's reflection
prompt the most natural material of any source in the catalog — but its
**Extraction (5) is the single lowest**, because it is the only source
whose content is routinely translated from another language before
publication. The baseline audit already named this exact risk ("no
language-detection guard... a real risk given Global Voices explicitly
translates from other languages") without yet having a source that
actually exercises it; Global Voices is that source.

---

## Compliance note found during this audit (not a new finding to fix now)

Wikinews' CC BY license requires **"credit + link to license"** per
`docs/content-source-policy.md` — distinct from Global Voices' CC license,
which requires **author name + link to the story**. The existing
attribution UI (`ReadingStep.tsx`) renders a source-hostname link for
every article and an author byline when one exists (added for Global
Voices), but never a link to the CC BY *license itself* specifically for
Wikinews. Wikinews articles are also collaboratively authored (no
individual byline), so the author field added for Global Voices doesn't
apply here — a hostname link alone may not fully satisfy "credit + link
to license" as literally stated. **Flagging this for manual legal
review, not proposing a fix** — resolving it, if needed, is a licensing/
copy decision, not a quality-scoring one, and this audit's scope is
quality, not legal review.

---

## Recommendations (quality tuning only — no architecture changes, no new features)

1. **Re-label or annotate the NIH source to reflect its actual scope.**
   The `content_sources.name` value "NIH" is misleading given the feed is
   NIEHS-specific — a one-row data correction (rename to "NIH (NIEHS)" or
   add a config note), not a pipeline change.
2. **Spot-check EU Commission and Library of Congress output first** once
   real ingestion runs — both are predicted to produce technically
   correct but low-engagement reflection prompts and less broadly useful
   vocabulary due to register, which is exactly the kind of issue that
   only shows up by reading real generated output, not by re-reading the
   code.
3. **Consider a register-aware framing note in the existing Gemini
   prompt** (`ai-processing.ts`'s `buildPrompt`) — e.g. explicitly asking
   Gemini to prefer everyday-usable vocabulary over subject-specific
   jargon when the source register is formal/bureaucratic, and to ground
   the reflection prompt in the article's most human-relatable detail
   when one exists. This is a prompt-wording tune, not a schema or
   pipeline change.
4. **Watch GOV.UK's per-item CEFR variance specifically** once live —
   it's the one source structurally likely to swing between plain-English
   and dense-policy register article to article, which the existing
   min/max range design only partially absorbs.
5. **Confirm whether Peace Corps' volunteer-story content has its own
   feed** before assuming the current press-release feed is final — worth
   a follow-up research check (not an implementation), since the original
   legal-review notes anticipated more narrative content than what's
   actually live.
6. **Resolve the Wikinews license-link question with a manual legal
   check**, per the compliance note above, before treating Wikinews'
   attribution as fully settled.
7. All seven cross-cutting fixes already named in
   `docs/content-quality-audit.md` (empty-string validation gap, quiz
   `type` hardcoding, reading-time-on-raw-HTML, CEFR ordering check, etc.)
   remain the highest-leverage work available — they improve every
   source in this table simultaneously, including the weakest ones,
   more than any source-specific tuning could on its own.
