# Content Source Policy

Status: **living document — re-evaluate before enabling any new source, and
whenever a source's own terms change.** Governs which RSS sources the
Content Engine (`docs/content-engine.md`) is permitted to ingest from, and
under what conditions. This document is the single source of truth for
that decision — a source should never be added to `content_sources` without
an entry here first.

## ⚠️ Current production state: reset to exactly one source

Every source below except **TechCrunch** was disabled and its published
articles deleted (`supabase/content-engine-reset-single-source.sql`) after
production repeatedly failed to produce full article bodies through the
page-fetch + Readability path every other source depended on.
`rss-provider.ts` no longer does a second HTTP fetch or Readability
extraction at all — it only stores what the RSS feed itself returns.
TechCrunch is the sole active source because its feed is confirmed to
carry the complete article in `content:encoded`, needing no page fetch.
Every entry below (including the ones marked APPROVED) reflects the
*legal/licensing* research done before this reset and is not itself a
statement of what's currently enabled — check `content_sources` in
Supabase for that. Additional sources will be re-added one at a time,
each independently verified against real production data, per the
"only after one source works perfectly will we add additional sources"
directive that produced this reset.

## Why this exists

The Content Engine's architecture (providers, pipeline, quality gate) is
content-source-agnostic by design — it doesn't know or care where an
article came from. But *whether we're legally and ethically allowed to
ingest a given source at all* is a business/legal decision, not an
architecture one, and needs to be made deliberately, once, per source —
not implicitly assumed because a feed exists and is technically fetchable.

## Research method and its limits

Every source below was researched via public web search and, where
possible, direct fetch of the source's own terms/copyright pages. **This
sandbox's network egress is blocked for arbitrary external hosts**, so
"Readability compatibility" and "AI enrichment compatibility" below are
informed judgments based on the source's known content structure and
style, not confirmed by actually running our extraction pipeline against
live pages. **Treat every non-APPROVED-with-high-confidence entry as
provisional** — confirm directly (fetch the source's actual current terms
page, or a lawyer, as appropriate) before enabling it in production.

## Classification definitions

- **APPROVED** — usable today under the source's own published terms, as
  they currently stand, with no separate request required. Still subject
  to normal attribution/compliance obligations noted per source.
- **REQUIRES_PERMISSION** — not usable as-is. Either the source's terms
  explicitly gate commercial/app use behind a request process (email,
  form, licensing agreement), or our own architecture needs a specific
  compliance feature built first (e.g., an attribution/link-back UI) before
  the source's own conditions are actually met. Not a permanent no — a
  defined path exists to reach APPROVED.
- **NOT_ALLOWED** — the source's own terms flatly prohibit this kind of
  use (automated ingestion, commercial/app redistribution) with no
  described path to permission. Do not integrate.

---

## ⚠️ Immediate flag: Breaking News English (already in production)

Retroactively researching Breaking News English's own copyright page
(`breakingnewsenglish.com/copyright.html`) for this policy surfaced
something that wasn't checked with this rigor when the source was first
selected: **copyright is held by Sean Banville**, the terms state
*"permission is not granted to copy and paste sections of the materials to
create different versions or formats of the materials,"* and the site
states it actively runs anti-plagiarism monitoring. This is a real, live
production exposure, not a hypothetical one — see the full entry under
REQUIRES_PERMISSION below for the recommended action (pause new ingestion
from this source pending direct written permission from the site owner).

---

## APPROVED (15)

### NASA News
- **Copyright:** Public domain — works of the U.S. federal government
  (17 U.S.C. §105). Confirmed directly on NASA's own Media Usage
  Guidelines.
- **RSS availability:** Yes — hub at `nasa.gov/rss-feeds/`; exact current
  "Breaking News" feed URL not independently confirmed (fetch-blocked from
  this sandbox), needs pinning down before implementation.
- **Commercial usage rights:** Permitted — NASA's guidelines explicitly
  cover "Internet Web pages," no non-commercial restriction stated for text
  content.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** Good practice, not strictly mandatory per
  NASA's own text.
- **Readability compatibility:** Likely high (unverified) — standard
  government press-release HTML, similar structure to sources already
  working in production.
- **AI enrichment compatibility:** Good — NASA articles are full narrative
  science journalism, substantial enough for summary/vocabulary/quiz
  generation. Expect a higher CEFR skew (B2–C1) than ESL-graded sources.
- **Risk level:** Low.
- **Notes:** Confirm the exact feed URL before implementing; watch for
  NASA's own carve-outs (logo/insignia, explicitly-marked third-party
  content, identifiable-person imagery — none apply to plain text
  ingestion).

### VOA Learning English
- **Copyright:** Public domain for original VOA/OCB content — a work of
  USAGM, a U.S. federal agency. Confirmed via USAGM's own content-request
  page.
- **RSS availability:** Yes, but with a real gap — `learningenglish.voanews.com/rssfeeds`
  is a hub of many per-program feeds; the ones identifiable by name
  describe audio programs read at slowed pace (already excluded earlier in
  this project for overlapping with the Podcast content type). No
  confirmed genuinely text-first feed URL identified yet.
- **Commercial usage rights:** Permitted for original content.
- **Educational reuse rights:** Explicitly permitted — VOA Learning English
  exists specifically for this purpose.
- **Attribution requirements:** Credit "VOA" or "Voice of America."
- **Readability compatibility:** Likely high (unverified) — VOA Learning
  English pages pair audio with plain-text transcripts/articles.
- **AI enrichment compatibility:** Excellent fit — content is already
  written/leveled for English learners, the closest content profile to
  Breaking News English.
- **Risk level:** Low, once the feed URL gap is resolved.
- **Notes:** **Real caveat, not disqualifying:** VOA's own terms warn that
  some content embeds third-party wire material (AP/Reuters/AFP) that is
  *not* public domain. VOA typically distinguishes its own rewritten
  "Learning English" text from wire content, but per-article verification
  isn't automated today. Must resolve the text-vs-audio feed URL question
  before implementation.

### NOAA / National Weather Service
- **Copyright:** Public domain, confirmed explicitly on `weather.gov`.
- **RSS availability:** Yes — extensive feed library at `weather.gov/rss/`
  and `noaa.gov/rss-feeds`.
- **Commercial usage rights:** Permitted, with conditions: don't claim it
  as your own, don't imply NOAA endorsement, don't modify content and
  present it as official government material.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** None strictly required for content use
  (trademark protection applies only to the NWS name/logo itself).
- **Readability compatibility:** Likely high for narrative content
  (unverified); some feeds (raw forecast/alert data) are short and
  formulaic rather than prose.
- **AI enrichment compatibility:** Mixed — prefer narrative science/climate
  feeds over raw forecast bulletins, which are too short and formulaic for
  meaningful summary/vocabulary/quiz generation.
- **Risk level:** Low.
- **Notes:** Pick the right feed within NOAA's library — not all of them
  are prose-length content suitable for a Learning Session.

### CDC Newsroom
- **Copyright:** Public domain, confirmed on CDC's own site.
- **RSS availability:** Yes — CDC Newsroom offers RSS feeds directly.
- **Commercial usage rights:** Permitted.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** Attribution to CDC requested when using
  public domain materials.
- **Readability compatibility:** Likely high (unverified) — standard press
  release structure.
- **AI enrichment compatibility:** Good — public health news is
  substantial narrative content.
- **Risk level:** Low.
- **Notes:** Watch for content developed by contractors/grantees, which
  CDC itself flags as separately restricted; CDC logo is not public domain.

### National Park Service
- **Copyright:** Presumed public domain (federal agency, same 17 U.S.C.
  §105 basis as NASA/CDC/USGS) — did not find an NPS-specific copyright
  statement distinct from the general federal policy, slightly lower
  confidence than sources with an explicit page.
- **RSS availability:** Yes — most individual parks publish their own news
  RSS feed.
- **Commercial usage rights:** Presumed permitted per standard federal
  policy; not independently confirmed with an NPS-specific statement.
- **Educational reuse rights:** Presumed permitted.
- **Attribution requirements:** Standard federal-agency credit practice.
- **Readability compatibility:** Likely high (unverified).
- **AI enrichment compatibility:** Good — park news/history content is
  narrative and substantial.
- **Risk level:** Low-Medium (slightly lower confidence than other federal
  sources due to the missing explicit statement — worth a direct check
  before relying on it long-term).
- **Notes:** Per-park feeds mean many small, low-volume sources rather than
  one central feed — practical/operational consideration, not a licensing
  one.

### USGS
- **Copyright:** Public domain, confirmed explicitly on `usgs.gov`.
- **RSS availability:** Yes.
- **Commercial usage rights:** Permitted.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** USGS requests acknowledgment as source.
- **Readability compatibility:** Likely high for narrative reports
  (unverified); earthquake/event bulletins are often very short and
  data-heavy.
- **AI enrichment compatibility:** Mixed — prefer feature/narrative content
  over raw event bulletins for the same reason as NOAA's alert feeds.
- **Risk level:** Low.
- **Notes:** Same "pick prose, not data bulletins" consideration as NOAA.

### NIH (National Institutes of Health)
- **Copyright:** Public domain for content prepared by NIH employees or
  under NIH contract, confirmed via NIAID/NIH Library pages.
- **RSS availability:** Yes — multiple NIH institutes (NIDCR, NIMH, etc.)
  offer their own RSS feeds.
- **Commercial usage rights:** Permitted for public domain content.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** Optional courtesy credit suggested (e.g.
  "Courtesy: National Institute of ...").
- **Readability compatibility:** Likely high (unverified) — standard press
  release/news structure.
- **AI enrichment compatibility:** Good — health research news is
  substantial narrative content.
- **Risk level:** Low.
- **Notes:** Health content — no special legal risk, but factual accuracy
  in AI-generated summaries matters more here than for lighter topics;
  normal quality-gate/enrichment process applies unchanged.

### Library of Congress
- **Copyright:** Public domain — explicitly a work of the U.S. government
  under 17 U.S.C. §105 **and** additionally released under CC0 1.0
  Universal for worldwide reuse. The strongest confirmation of any source
  researched.
- **RSS availability:** Yes — e.g. `blogs.loc.gov/copyright/feed` and other
  blog category feeds.
- **Commercial usage rights:** Permitted (CC0 explicitly allows commercial
  use).
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** None required (CC0 waives even
  attribution), though crediting LoC is good practice.
- **Readability compatibility:** Likely high (unverified) — standard blog
  platform structure.
- **AI enrichment compatibility:** Good — LoC blog posts are narrative,
  history/culture/education-focused, well-suited to ESL reading practice.
- **Risk level:** Low.
- **Notes:** Best legal footing of any source researched — worth
  prioritizing.

### Peace Corps
- **Copyright:** Public domain, confirmed on `peacecorps.gov` — federal
  agency.
- **RSS availability:** Media Center exists; specific RSS feed URL not
  independently confirmed (fetch-blocked).
- **Commercial usage rights:** Permitted.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** Standard federal-agency credit practice.
- **Readability compatibility:** Likely high (unverified) — blog/story
  format.
- **AI enrichment compatibility:** Good — volunteer stories are narrative,
  personal, culturally rich — a good fit for reflection-prompt generation
  specifically.
- **Risk level:** Low.
- **Notes:** Confirm the exact feed URL before implementing; Peace Corps
  seal/logo is separately protected (not relevant to text ingestion).

### UK Government (GOV.UK)
- **Copyright:** Crown copyright, released under the Open Government
  Licence (OGL) — an explicit, self-executing permissive license, not
  public domain but functionally close to it for our purposes.
- **RSS availability:** Yes — GOV.UK and The National Archives both
  publish RSS feeds.
- **Commercial usage rights:** Permitted — OGL explicitly allows
  commercial use, no registration or application required.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** Required — must attribute the information
  provider and source per OGL terms (a real, non-optional obligation,
  unlike the public-domain U.S. federal sources above).
- **Readability compatibility:** Likely high (unverified) — standard
  GOV.UK content structure.
- **AI enrichment compatibility:** Good — policy/news content is narrative
  and substantial; expect a British-English variant which our pipeline
  already handles fine (no US/UK spelling normalization needed for CEFR
  leveling).
- **Risk level:** Low.
- **Notes:** **The one source in this APPROVED tier with a real,
  enforceable attribution requirement** — the attribution-UI work already
  flagged for TechCrunch below would also cover this source's obligation.

### Wikinews
- **Copyright:** Creative Commons Attribution 4.0 (content since Dec 2024)
  or CC BY 2.5 (earlier content) — confirmed directly via Wikinews'
  Meta-Wiki license page.
- **RSS availability:** Yes.
- **Commercial usage rights:** Permitted — CC BY has no non-commercial
  restriction.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** Required per CC BY (credit + link to
  license).
- **Readability compatibility:** Likely high (unverified) — MediaWiki
  platform, clean semantic HTML.
- **AI enrichment compatibility:** Good — written as standard news
  articles.
- **Risk level:** Low.
- **Notes:** Wikinews exists specifically to be freely reused — the
  license was deliberately chosen to be maximally permissive.

### Global Voices
- **Copyright:** Creative Commons Attribution-only — confirmed via Global
  Voices' own Republishing Guidelines, explicitly including commercial use.
- **RSS availability:** Yes — per-author and general feeds.
- **Commercial usage rights:** Explicitly permitted, "even commercially,"
  per their own published policy — the clearest commercial green light of
  any source researched besides the public-domain government ones.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** Required — link to the original story +
  author name at the top of the republished piece.
- **Readability compatibility:** Likely high (unverified) — WordPress-based
  platform.
- **AI enrichment compatibility:** Good, and distinctive — Global Voices
  translates citizen journalism from around the world, giving genuinely
  international topic diversity our other sources (mostly US/UK-centric)
  don't have.
- **Risk level:** Low.
- **Notes:** Strong candidate to prioritize for topic diversity alongside
  legal safety.

### European Commission (Press Corner) — ⚠️ disabled, see note

**Status update:** disabled in production
(`supabase/content-source-swap-eu-for-techcrunch.sql`) — scored lowest
(5.3) in `docs/content-quality-audit-by-source.md`, and was swapped for
TechCrunch below to fix the "article body only ~100-170 chars" production
issue (this source, like every other government press-release feed
enabled at the time, depends on a full-page fetch that was resolving to
null in production). This is a quality/operational decision, not a legal
one — the APPROVED classification below is unchanged and this source can
be re-enabled later once the page-fetch/bot-blocking question is
resolved for the government-source cohort as a whole.

### European Commission (Press Corner)
- **Copyright:** EU institutional content, generally released under the
  EU's default open reuse policy (Commission Decision 2011/833/EU, commonly
  CC BY 4.0 for Commission documents) unless otherwise indicated — medium
  confidence, general EU policy rather than a Press-Corner-specific
  statement I could directly confirm.
- **RSS availability:** Yes — `ec.europa.eu/commission/presscorner/api/rss`.
- **Commercial usage rights:** Generally permitted under the default reuse
  policy; individual press releases should be spot-checked for exceptions.
- **Educational reuse rights:** Permitted.
- **Attribution requirements:** Required per CC BY-style terms.
- **Readability compatibility:** Likely high (unverified) — standard
  institutional press release structure.
- **AI enrichment compatibility:** Good, though EU press releases skew
  formal/bureaucratic in register — expect higher CEFR levels (B2–C1) and
  possibly less engaging reflection-prompt material than narrative sources.
- **Risk level:** Low-Medium (confirm the specific reuse notice on
  `ec.europa.eu/commission/presscorner` directly before relying on this
  long-term — the general EU policy is well-established, but this is the
  one APPROVED entry not backed by a source-specific statement I directly
  verified).
- **Notes:** Worth a direct confirmation pass before implementation despite
  the overall favorable assessment.

### FEMA
- **Copyright:** Public domain, confirmed — most FEMA.gov material is free
  of copyright.
- **RSS availability:** Yes — extensive feed library.
- **Commercial usage rights:** Explicitly permitted — FEMA's own terms
  state feeds are "free of charge for commercial/non-commercial use by
  individuals and organizations," the most explicit commercial green light
  of any government source researched.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** None required.
- **Readability compatibility:** Likely high (unverified) — standard press
  release structure.
- **AI enrichment compatibility:** Good for narrative disaster-response
  features; weaker fit for short alert-style bulletins (same "pick prose"
  consideration as NOAA/USGS).
- **Risk level:** Low.
- **Notes:** FEMA sometimes uses licensed/restricted photos — irrelevant to
  text-only ingestion, but worth remembering if images are ever added.

### EPA
- **Copyright:** Public domain, confirmed — "all data produced by the U.S.
  EPA is by default in the public domain" per 17 U.S.C. §105.
- **RSS availability:** Yes — EPA Newsroom offers topic-based feeds.
- **Commercial usage rights:** Permitted.
- **Educational reuse rights:** Explicitly permitted.
- **Attribution requirements:** None required, standard credit practice
  suggested.
- **Readability compatibility:** Likely high (unverified) — standard press
  release structure.
- **AI enrichment compatibility:** Good — environmental policy/science news
  is substantial narrative content.
- **Risk level:** Low.
- **Notes:** Straightforward, no caveats found beyond the general "verify
  any embedded third-party material" federal-content default.

### TechCrunch — moved from REQUIRES_PERMISSION, both conditions now met
- **Copyright:** Standard commercial copyright (Yahoo/TechCrunch Media).
- **RSS availability:** Yes, confirmed working, full content via
  `content:encoded` (`techcrunch.com/feed/`) — the entire article body is
  in the feed itself, not an excerpt.
- **Commercial usage rights:** Conditionally permitted per TechCrunch's own
  RSS Terms of Use — restricted to *only* the content provided in the
  feed (no full-page fetching), with mandatory attribution and a link back
  to the original article. **Both conditions are now enforced, not just
  noted:** attribution + link-back already existed generically in
  `ReadingStep.tsx` (built for GOV.UK/Global Voices); "no full-page
  fetching" is enforced via the new `feedContentOnly` source-config flag
  (`rss-provider.ts`), which skips `fetchArticlePage` entirely for this
  source — the RSS body is the only body ever used.
- **Educational reuse rights:** Not separately addressed; governed by the
  same RSS terms.
- **Attribution requirements:** Required, explicit — attribution + link to
  the full article on TechCrunch. Satisfied by the existing attribution UI.
- **Readability compatibility:** N/A by design — full-page fetching is
  never attempted for this source; feed content is sufficient and already
  HTML-structured compatibly with our existing pipeline.
- **AI enrichment compatibility:** Good — substantial tech journalism,
  though topic profile (startups/VC/AI industry) skews adult/professional
  rather than general-interest.
- **Risk level:** Low, now that both conditions above are enforced in
  code rather than just documented as required.
- **Notes:** Worth being transparent that TechCrunch is documented as
  blocking Anthropic's ClaudeBot in its `robots.txt` — a different bot
  than ours, and not a legal bar to RSS feed use (no page fetch happens
  for this source at all), but worth the team being aware of given who's
  implementing this. Enabled in place of European Commission Press Corner
  (see that entry's status note above) via
  `supabase/content-source-swap-eu-for-techcrunch.sql`.

---

## REQUIRES_PERMISSION (5)

### Breaking News English — **already in production; recommend pausing new ingestion**
- **Copyright:** Held by Sean Banville (2004–2023 per the site's own
  copyright page) — **not** public domain, **not** a permissive license.
- **RSS availability:** Yes — already implemented (`bne.xml`).
- **Commercial usage rights:** Unclear/likely restricted — the site's own
  terms state permission is *not* granted to "copy and paste sections of
  the materials to create different versions or formats," and the site
  states it actively runs anti-plagiarism monitoring. No commercial-license
  path was found in this research pass.
- **Educational reuse rights:** The site's own stated mission is ESL
  education, so there's likely an intended path here, but it isn't
  published as an explicit RSS/syndication license the way VOA's or
  NASA's terms are.
- **Attribution requirements:** Not clearly specified for this use case.
- **Readability compatibility:** Confirmed working — already in
  production.
- **AI enrichment compatibility:** Confirmed working — already in
  production, real published articles exist today.
- **Risk level:** **Medium-High** given it's live in production without a
  confirmed license for this specific use.
- **Notes:** **Action recommended: contact Sean Banville / Breaking News
  English directly for explicit written permission covering AI-enrichment
  and in-app republishing, or pause new ingestion from this source until
  that's resolved.** This is the most consequential finding in this
  document — flagging clearly rather than downgrading quietly.

### UN Tourism
- **Copyright:** UN Tourism's own copyright page states all publications
  are protected; reproduction requires prior written permission.
- **RSS availability:** No RSS feed found in this research.
- **Commercial usage rights:** Requires direct written permission
  (`pub@unwto.org` / `elibrary@untourism.int`), and for some territories, a
  copyright collecting society.
- **Educational reuse rights:** Same permission process as commercial —
  not separately favorable.
- **Attribution requirements:** Would be specified in any granted
  permission.
- **Readability compatibility:** Not evaluated — moot given no feed exists.
- **AI enrichment compatibility:** Not evaluated.
- **Risk level:** High if used without permission.
- **Notes:** Two blockers, not one — no confirmed feed AND an explicit
  permission gate. Not worth pursuing unless UN Tourism is a strategic
  priority worth a direct licensing conversation.

### World Health Organization (WHO)
- **Copyright:** CC BY-NC-SA 3.0 IGO for general content — non-commercial
  only.
- **RSS availability:** Yes — regional office feeds (AFRO, EMRO, etc.).
- **Commercial usage rights:** Explicitly restricted — WHO's own terms
  state feeds used "in conjunction with any commercial purposes" require
  emailing WHO directly with organization/purpose details.
- **Educational reuse rights:** Permitted under the NC-SA license for
  non-commercial educational use — but LinguABC as a commercial product
  likely doesn't qualify without the separate permission above.
- **Attribution requirements:** Required — WHO as source, with URL
  citation.
- **Readability compatibility:** Likely high (unverified).
- **AI enrichment compatibility:** Good — substantial health content,
  though same accuracy-matters-more consideration as NIH.
- **Risk level:** Medium-High without permission.
- **Notes:** Same "email for a commercial license" pattern as UN Tourism —
  a defined path exists, just not automatic.

### Smithsonian Magazine
- **Copyright:** Mixed — CC0-marked content is free for any use; all other
  content requires permission for commercial purposes per the Smithsonian
  Institution's own Terms of Use.
- **RSS availability:** Yes (`smithsonianmag.com/rss/`).
- **Commercial usage rights:** Restricted by default; a licensing form
  exists for commercial reuse requests.
- **Educational reuse rights:** Broader than commercial (fair-use-adjacent
  language for "personal, educational... non-commercial uses"), but
  automated bulk ingestion into a commercial product doesn't cleanly fit
  that carve-out either.
- **Attribution requirements:** Would be specified per granted permission.
- **Readability compatibility:** Likely high (unverified) — standard
  magazine CMS.
- **AI enrichment compatibility:** Excellent — Smithsonian's long-form
  history/science/culture writing is exactly the kind of rich narrative
  content that produces strong summaries/vocabulary/reflection prompts.
- **Risk level:** Medium — the content quality is genuinely excellent, but
  the default license doesn't cover our use case without a request.
- **Notes:** Worth pursuing the commercial licensing conversation given the
  content quality — better content-fit than several APPROVED sources.

### British Council LearnEnglish
- **Copyright:** British Council-owned; RSS feeds exist with attribution
  requirements, but I could not confirm explicit commercial-use terms one
  way or the other in this research pass.
- **RSS availability:** Yes (`learnenglish.britishcouncil.org`).
- **Commercial usage rights:** **Unconfirmed** — this is a genuine research
  gap, not a known restriction; needs a direct read of British Council's
  full Terms and Conditions before any decision.
- **Educational reuse rights:** Likely favorable given British Council's
  educational mission, but not confirmed in writing.
- **Attribution requirements:** Confirmed required — "British Council
  LearnEnglish" or the URL, logo use prohibited.
- **Readability compatibility:** Likely high (unverified) — purpose-built
  ESL content platform.
- **AI enrichment compatibility:** Excellent — same ESL-graded content
  profile as VOA Learning English and Breaking News English.
- **Risk level:** Medium, specifically because of the unconfirmed
  commercial terms rather than a known restriction.
- **Notes:** Strong content-fit candidate — worth a direct follow-up
  research pass (read the actual Terms and Conditions page) before
  classifying further; don't implement until that's done.

---

## NOT_ALLOWED (3)

### Reader's Digest
- **Copyright:** Standard commercial copyright.
- **RSS availability:** Yes (`rd.com/feed` and category feeds).
- **Commercial usage rights:** Explicitly prohibited — Reader's Digest's
  own terms restrict feeds to "personal, non-commercial use by individuals
  only," with no described path to a broader license.
- **Educational reuse rights:** Not separately addressed; same restriction
  applies.
- **Attribution requirements:** N/A — use itself isn't licensed for this
  purpose.
- **Readability compatibility:** Not evaluated — moot given the licensing
  block.
- **AI enrichment compatibility:** Not evaluated.
- **Risk level:** High if used regardless.
- **Notes:** Do not integrate absent a separate commercial agreement
  directly with Reader's Digest.

### News in Levels
- **Copyright:** Standard commercial copyright.
- **RSS availability:** Not confirmed.
- **Commercial usage rights:** Explicitly and clearly prohibited — the
  site's own Conditions of Use state it is "forbidden to copy anything,"
  permits only individual students (Levels 1–3, personal use, "never for
  making money"), and explicitly states institutions cannot be granted
  permission at all.
- **Educational reuse rights:** Limited to individual students/teachers in
  live classes up to specific size limits — does not extend to an
  automated product ingesting and republishing content.
- **Attribution requirements:** N/A — use itself isn't licensed for this
  purpose.
- **Readability compatibility:** Not evaluated — moot.
- **AI enrichment compatibility:** Not evaluated.
- **Risk level:** High if used regardless — this is one of the most
  explicit prohibitions found in this entire research process.
- **Notes:** Despite being a natural ESL-content peer to Breaking News
  English and VOA Learning English, this source's own terms are the
  clearest "no" of anything researched. Do not integrate.

### ProPublica
- **Copyright:** Creative Commons Attribution-NonCommercial-NoDerivs, plus
  ProPublica-specific additional restrictions.
- **RSS availability:** Yes.
- **Commercial usage rights:** Restricted — explicitly cannot be used to
  "populate a website designed... solely to gain revenue," and explicitly
  **"cannot actively publish or submit their work for syndication to third
  party platforms or apps"** — directly and explicitly prohibiting exactly
  the automated ingestion pipeline this project is built around.
- **Educational reuse rights:** Same restriction — no carve-out for
  automated/app-based educational reuse found.
- **Attribution requirements:** Required (moot given the prohibition
  above).
- **Readability compatibility:** Not evaluated — moot.
- **AI enrichment compatibility:** Would otherwise be excellent —
  investigative journalism is exactly the kind of substantial narrative
  content our pipeline handles well. The block here is entirely licensing,
  not technical.
- **Risk level:** High if used regardless — this is an explicit,
  unambiguous prohibition on the exact mechanism (app syndication) this
  project uses.
- **Notes:** Do not integrate under the current automated-RSS-ingestion
  architecture. ProPublica's per-article manual "Republish" button
  workflow (individually selected, not bulk/automated) is explicitly
  outside what they permit — incompatible with this project by design, not
  just by omission.

---

## Insufficient information — needs direct follow-up before classifying

- **ESL Fast (eslfast.com):** No copyright/terms page located in this
  research pass. Needs a direct fetch/read before any classification.
- **USA.gov / America.gov:** General federal public-domain principles
  likely apply, but USA.gov itself is largely a portal aggregating other
  agencies' content rather than a primary content source — needs
  clarification on what, specifically, would be ingested before evaluating.

---

## Summary

| Classification | Count | Sources |
|---|---|---|
| APPROVED | 16 | NASA News, VOA Learning English, NOAA/NWS, CDC Newsroom, National Park Service, USGS, NIH, Library of Congress, Peace Corps, UK Government (GOV.UK), Wikinews, Global Voices, European Commission Press Corner (⚠️ disabled, see note), FEMA, EPA, TechCrunch |
| REQUIRES_PERMISSION | 5 | Breaking News English (⚠️ already in production), UN Tourism, WHO, Smithsonian Magazine, British Council LearnEnglish |
| NOT_ALLOWED | 3 | Reader's Digest, News in Levels, ProPublica |
| Needs more research | 2 | ESL Fast, USA.gov |

**The 15-source target is met without relying on Breaking News English**,
which is deliberate given its REQUIRES_PERMISSION status above — the
recommended production-safe sources for LinguABC are the full APPROVED
list, currently 13 actually enabled (European Commission Press Corner is
APPROVED but operationally disabled — see its status note above).

## Recommended next steps (not implemented — policy only, per this task)

1. Resolve the Breaking News English situation first — it's the one
   already live.
2. Before implementing any APPROVED source: confirm its exact current feed
   URL directly (several above are hub pages, not single confirmed XML
   URLs) and spot-check its terms page hasn't changed since this document
   was written.
3. Build the attribution/link-back UI needed by GOV.UK (mandatory, in the
   APPROVED tier) and TechCrunch (in REQUIRES_PERMISSION) once more than
   one source needs it — worth doing once, generically, rather than
   per-source.
4. Revisit British Council LearnEnglish with a direct terms read — likely
   resolvable to APPROVED given its strong content-fit and semi-public
   status.
5. Re-run this evaluation whenever a source's own terms page changes, or
   at minimum annually.
