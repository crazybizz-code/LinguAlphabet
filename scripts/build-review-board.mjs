#!/usr/bin/env node
/**
 * Build the Meridian design-system review board.
 * Inlines the real component CSS (single source of truth) and renders
 * every component at Desktop / Laptop / Tablet / Mobile container
 * widths, plus state matrices, into one self-contained HTML page.
 *
 *   node scripts/build-review-board.mjs [outFile]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEFR_LEVELS } from '../src/design-system/js/cefr-card.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ds = (p) => readFileSync(join(root, 'src/design-system', p), 'utf8');

const systemCss = [
  'tokens.css',
  'base.css',
  'components/section-heading.css',
  'components/orb-cta.css',
  'components/bubble.css',
  'components/tuto-hero.css',
  'components/cefr-card.css',
  'components/canvas.css',
].map(ds).join('\n');

const VIEWPORTS = [
  ['Desktop', 1440],
  ['Laptop', 1152],
  ['Tablet', 834],
  ['Mobile', 390],
];

/* ---------------------------------------------------------------
   Demo fragments (static mirrors of the JS factories' output)
   --------------------------------------------------------------- */

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

const cefrCard = (level, { checked = false, disabled = false, extra = '' } = {}) => `
  <button type="button" class="la-cefr-card ${extra}" data-level="${level.id}"
          role="radio" aria-checked="${checked}"${disabled ? ' aria-disabled="true"' : ''}>
    <span class="la-cefr-card__glyph">${level.glyph}</span>
    <span class="la-cefr-card__text">
      <span class="la-cefr-card__code">${level.code}</span>
      <span class="la-cefr-card__name">${level.name}</span>
      <span class="la-cefr-card__tone">${level.tone}</span>
    </span>
    <span class="la-cefr-card__check">${CHECK}</span>
  </button>`;

const cefrGrid = cefrCard.length && `
  <div class="la-cefr-grid" role="radiogroup" aria-label="Choose your current English level">
    ${CEFR_LEVELS.map((l) => cefrCard(l, { checked: l.id === 'b1' })).join('')}
  </div>`;

const sectionHeading = `
  <header class="la-section-heading">
    <div class="la-section-heading__grid">
      <span class="la-section-heading__eyebrow">Discovery Session</span>
      <h2 class="la-section-heading__title">Where is your English today?</h2>
      <p class="la-section-heading__lede">Pick the level that feels closest. Tuto adjusts everything else around it — nothing here is a test.</p>
      <div class="la-section-heading__meta">Step 2 of 5</div>
    </div>
  </header>`;

const sectionHeadingCenter = `
  <header class="la-section-heading la-section-heading--center">
    <div class="la-section-heading__grid">
      <span class="la-section-heading__eyebrow">Adaptive Assessment</span>
      <h2 class="la-section-heading__title">Let&rsquo;s hear you think out loud</h2>
      <p class="la-section-heading__lede">Answer in your own words. Tuto listens for how you build sentences, not for mistakes.</p>
    </div>
  </header>`;

const orbCta = (label, cls = '', attrs = '') =>
  `<button type="button" class="la-orb-cta ${cls}" ${attrs}>
     <span class="la-orb-cta__orb" aria-hidden="true"></span>
     <span class="la-orb-cta__label">${label}</span>
   </button>`;

const orbCtaRow = `
  <div class="demo-row">
    ${orbCta('Start my Discovery Session', 'la-orb-cta--lg')}
    ${orbCta('Continue')}
    ${orbCta('Not now', 'la-orb-cta--quiet')}
  </div>`;

const orbCtaStates = `
  <div class="demo-states">
    <div class="demo-state"><span class="demo-state__label">Default</span>${orbCta('Continue')}</div>
    <div class="demo-state"><span class="demo-state__label">Hover</span>${orbCta('Continue', 'is-hover')}</div>
    <div class="demo-state"><span class="demo-state__label">Focus</span>${orbCta('Continue', 'demo-focus-pill')}</div>
    <div class="demo-state"><span class="demo-state__label">Loading</span>${orbCta('Saving your level…', '', 'aria-busy="true"')}</div>
    <div class="demo-state"><span class="demo-state__label">Disabled</span>${orbCta('Continue', '', 'disabled')}</div>
    <div class="demo-state"><span class="demo-state__label">Quiet · hover</span>${orbCta('Skip for now', 'la-orb-cta--quiet is-hover')}</div>
  </div>`;

const bubble = ({ speaker = 'tuto', body, name, time, extra = '' }) => `
  <article class="la-bubble la-bubble--${speaker} ${extra}">
    <span class="la-bubble__avatar" aria-hidden="true"></span>
    <div class="la-bubble__body">${body}</div>
    <footer class="la-bubble__meta"><span class="la-bubble__name">${name}</span><time>${time}</time></footer>
  </article>`;

const conversation = `
  <div class="demo-thread">
    ${bubble({ body: '<p>Great to meet you, Aziz! Before we design your learning journey, I&rsquo;d love to know where your English is right now.</p><p>There&rsquo;s no wrong answer — this just sets our starting point.</p>', name: 'Tuto', time: '14:02' })}
    ${bubble({ speaker: 'learner', body: '<p>I can follow podcasts, but speaking still feels slow.</p>', name: 'You', time: '14:03' })}
    ${bubble({ body: '<p>That&rsquo;s a really common place to be — listening usually runs ahead of speaking. Let&rsquo;s use that as our anchor&hellip;</p>', name: 'Tuto', time: '14:03', extra: 'la-bubble--streaming' })}
    ${bubble({ body: '<span class="la-bubble__typing" role="status" aria-label="Tuto is typing"><i></i><i></i><i></i></span>', name: 'Tuto', time: 'now' })}
  </div>`;

const tutoHero = (state = 'idle', title = 'Let&rsquo;s find your starting point.', sub = 'Choose the level that feels closest — your Adaptive Assessment will fine-tune it afterwards.') => `
  <section class="la-tuto-hero" data-state="${state}">
    <div class="la-tuto-hero__grid">
      <div class="la-tuto-hero__stage" aria-hidden="true">
        <span class="la-tuto-hero__halo"></span>
        <span class="la-tuto-hero__orb"></span>
      </div>
      <div class="la-tuto-hero__copy">
        <span class="la-tuto-hero__eyebrow">Tuto · your English coach</span>
        <h1 class="la-tuto-hero__title">${title}</h1>
        <p class="la-tuto-hero__sub">${sub}</p>
      </div>
    </div>
  </section>`;

const tutoStates = `
  <div class="demo-states demo-states--orbs">
    ${['idle', 'listening', 'thinking', 'speaking', 'celebrating'].map((s) => `
      <div class="demo-state">
        <span class="demo-state__label">${s}</span>
        <section class="la-tuto-hero" data-state="${s}" style="width:9rem">
          <div class="la-tuto-hero__stage" style="width:7rem" aria-hidden="true">
            <span class="la-tuto-hero__halo"></span>
            <span class="la-tuto-hero__orb"></span>
          </div>
        </section>
      </div>`).join('')}
  </div>`;

const cefrStates = `
  <div class="demo-states demo-states--cards">
    <div class="demo-state"><span class="demo-state__label">Default</span>${cefrCard(CEFR_LEVELS[0])}</div>
    <div class="demo-state"><span class="demo-state__label">Hover</span>${cefrCard(CEFR_LEVELS[2], { extra: 'is-hover' })}</div>
    <div class="demo-state"><span class="demo-state__label">Selected</span>${cefrCard(CEFR_LEVELS[3], { checked: true })}</div>
    <div class="demo-state"><span class="demo-state__label">Keyboard focus</span>${cefrCard(CEFR_LEVELS[4], { extra: 'demo-focus-card' })}</div>
    <div class="demo-state"><span class="demo-state__label">Disabled</span>${cefrCard(CEFR_LEVELS[5], { disabled: true })}</div>
  </div>`;

const canvasDemo = `
  <main class="la-canvas la-canvas--focus la-canvas--scroll" style="height:640px" aria-label="Discovery Session">
    <div class="la-canvas__inner">
      <div class="la-canvas__header">${sectionHeadingCenter}</div>
      <div class="la-canvas__stage">
        ${bubble({ body: '<p>Ready when you are. Which of these feels most like you today?</p>', name: 'Tuto', time: '14:05' })}
        <div class="la-cefr-grid" role="radiogroup" aria-label="Choose your current English level">
          ${CEFR_LEVELS.slice(0, 4).map((l) => cefrCard(l, { checked: l.id === 'b1' })).join('')}
        </div>
      </div>
      <div class="la-canvas__dock">
        ${orbCta('Not sure yet', 'la-orb-cta--quiet')}
        ${orbCta('This feels right', 'la-orb-cta--lg')}
      </div>
    </div>
  </main>`;

/* ---------------------------------------------------------------
   Foundations panel
   --------------------------------------------------------------- */

const swatch = (name, val, style = '') =>
  `<div class="fd-swatch"><span class="fd-swatch__chip" style="background:${style || val}"></span><span class="fd-swatch__name">${name}</span><span class="fd-swatch__val">${val}</span></div>`;

const foundations = `
  <div class="fd">
    <div class="fd-aurora"></div>
    <div class="fd-grid">
      ${swatch('Canvas 0', '#070B18')}${swatch('Canvas 2', '#0E1530')}
      ${swatch('Iris', '#7C5CFF')}${swatch('Signal Cyan', '#36D6CE')}
      ${swatch('Warm Coral', '#FF7E6B')}${swatch('Ink High', '#F2F5FF')}
    </div>
    <div class="fd-grid fd-grid--cefr">
      ${swatch('A1 Spark', '#FFB74A')}${swatch('A2 Ember', '#FF8A66')}
      ${swatch('B1 Bloom', '#F06FB7')}${swatch('B2 Momentum', '#9D7BFF')}
      ${swatch('C1 Constellation', '#5D8DFF')}${swatch('C2 Summit', '#38D6CE')}
    </div>
    <div class="fd-type">
      <p class="fd-type__display">Sora 600 — Where is your English today?</p>
      <p class="fd-type__body">Body — Tuto listens for how you build sentences, not for mistakes. 16/1.6, 62ch measure.</p>
      <p class="fd-type__caps">Caps label · 12px · 0.14em tracking</p>
    </div>
  </div>`;

/* ---------------------------------------------------------------
   Board assembly
   --------------------------------------------------------------- */

const frame = ([name, w], demo) => `
  <div class="vp" data-w="${w}">
    <span class="vp__chip">${name} · ${w}px</span>
    <div class="vp__frame" style="width:${w}px">${demo}</div>
  </div>`;

const section = (num, title, note, demo, { states = '', allViewports = true } = {}) => `
  <section class="board-section" id="s${num}">
    <div class="board-section__head">
      <h2>${num}. ${title}</h2>
      <p>${note}</p>
    </div>
    ${allViewports ? VIEWPORTS.map((vp) => frame(vp, demo)).join('') : frame(VIEWPORTS[0], demo)}
    ${states ? `<h3 class="board-section__sub">State matrix</h3>${frame(['Desktop', 1440], states)}` : ''}
  </section>`;

const boardCss = `
  /* ---- board chrome (not part of the design system) ---- */
  *, *::before, *::after { box-sizing: border-box; }
  html { color-scheme: dark; }
  body { margin: 0; background: #05070f; color: var(--la-ink-hi); font-family: var(--la-font-body); }
  .board { max-width: 1120px; margin-inline: auto; padding: 48px 24px 96px; display: grid; gap: 56px; }
  .board-head { display: grid; gap: 12px; padding-bottom: 24px; border-bottom: 1px solid var(--la-stroke-1); }
  .board-head h1 { margin: 0; font-family: var(--la-font-display); font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 600; letter-spacing: -0.02em; }
  .board-head h1 em { font-style: normal; background: var(--la-aurora); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .board-head p { margin: 0; color: var(--la-ink-mid); max-width: 68ch; line-height: 1.6; }
  .board-head .k { font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--la-ink-low); font-weight: 600; }
  .board-section { display: grid; gap: 20px; }
  .board-section__head h2 { margin: 0 0 6px; font-family: var(--la-font-display); font-size: 1.35rem; font-weight: 600; }
  .board-section__head p { margin: 0; color: var(--la-ink-mid); max-width: 72ch; line-height: 1.55; }
  .board-section__sub { margin: 12px 0 0; font-size: 0.8rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--la-ink-low); }
  .vp { position: relative; overflow: hidden; border: 1px solid var(--la-stroke-1); border-radius: 14px; background: linear-gradient(180deg, var(--la-canvas-2), var(--la-canvas-0)); }
  .vp__chip { position: absolute; z-index: 2; top: 10px; right: 12px; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--la-ink-low); background: rgba(5, 7, 15, 0.7); border: 1px solid var(--la-stroke-1); border-radius: 999px; padding: 3px 10px; }
  .vp__frame { container-type: inline-size; transform-origin: top left; padding: 48px 40px; margin-inline: auto; }
  .vp__frame:has(.la-canvas) { padding: 0; }
  /* demo helpers */
  .demo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; }
  .demo-thread { display: flex; flex-direction: column; gap: 20px; }
  .demo-states { display: flex; flex-wrap: wrap; align-items: end; gap: 28px; }
  .demo-states--cards { align-items: stretch; }
  .demo-states--cards .demo-state { width: 320px; }
  .demo-state { display: grid; gap: 10px; align-content: start; }
  .demo-state__label { font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--la-ink-low); font-weight: 600; }
  .demo-state .la-cefr-card { height: 100%; }
  .demo-focus-pill { box-shadow: var(--la-focus-ring), var(--la-glow-iris); }
  .demo-focus-card { box-shadow: var(--la-focus-ring), var(--la-shadow-1); }
  /* foundations */
  .fd { display: grid; gap: 20px; padding: 28px; border: 1px solid var(--la-stroke-1); border-radius: 14px; background: linear-gradient(180deg, var(--la-canvas-2), var(--la-canvas-0)); }
  .fd-aurora { height: 10px; border-radius: 999px; background: var(--la-aurora); box-shadow: var(--la-glow-iris); }
  .fd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .fd-swatch { display: grid; gap: 6px; font-size: 0.75rem; }
  .fd-swatch__chip { height: 44px; border-radius: 10px; border: 1px solid var(--la-stroke-1); }
  .fd-swatch__name { color: var(--la-ink-mid); font-weight: 600; }
  .fd-swatch__val { color: var(--la-ink-low); font-variant-numeric: tabular-nums; }
  .fd-type { display: grid; gap: 8px; border-top: 1px solid var(--la-stroke-1); padding-top: 18px; }
  .fd-type__display { margin: 0; font-family: var(--la-font-display); font-size: 1.6rem; font-weight: 600; letter-spacing: -0.015em; }
  .fd-type__body { margin: 0; color: var(--la-ink-mid); line-height: 1.6; max-width: 62ch; }
  .fd-type__caps { margin: 0; font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--la-ink-low); font-weight: 600; }
  .board-foot { color: var(--la-ink-low); font-size: 0.85rem; line-height: 1.6; border-top: 1px solid var(--la-stroke-1); padding-top: 20px; }
`;

const fitScript = `
  document.querySelectorAll('.vp').forEach((vp) => {
    const f = vp.querySelector('.vp__frame');
    const w = +vp.dataset.w;
    const fit = () => {
      const s = Math.min(1, vp.clientWidth / w);
      f.style.transform = 'scale(' + s + ')';
      vp.style.height = f.getBoundingClientRect().height + 'px';
    };
    new ResizeObserver(fit).observe(vp);
    requestAnimationFrame(fit);
  });
`;

const content = `<title>LinguAlphabet · Meridian DS v1 — Review Board</title>
<style>${systemCss}\n${boardCss}</style>
<div class="board">
  <header class="board-head">
    <span class="k">LinguAlphabet Design System v1 · founder review</span>
    <h1><em>Meridian</em> component library</h1>
    <p>Six production components rendered at Desktop 1440 · Laptop 1152 · Tablet 834 · Mobile 390 container widths (frames are scaled to fit — hover and focus states are live inside them). The deep single-theme stage is a deliberate design decision. Reduced-motion mode collapses every animation to instant state changes.</p>
  </header>

  <section class="board-section" id="s0">
    <div class="board-section__head"><h2>0. Foundations</h2>
    <p>Stage palette, the aurora gradient, the CEFR sunrise&rarr;open-sky spectrum, and the type ramp.</p></div>
    ${foundations}
  </section>

  ${section(1, 'CEFR Choice Card', 'Six siblings, one language: identical anatomy, each lit by its own accent, glyph and tone line. Grid: 3&times;2 on desktop, 2-up on tablet, single column on mobile. B1 shown selected.', cefrGrid, { states: cefrStates })}
  ${section(2, 'Conversation Bubble', 'Coach turns are glass with an iris presence dot; learner turns are iris-tinted and right-aligned. Includes streaming caret and typing indicator.', conversation)}
  ${section(3, 'Tuto Hero', 'Tuto&rsquo;s presence: a living orb plus greeting. Side-by-side in wide containers, stacked and centered in narrow ones. The scene&rsquo;s state machine drives the orb.', tutoHero(), { states: tutoStates })}
  ${section(4, 'Orb CTA', 'The primary action of a scene — a pill carrying a small living orb. One primary per view; quiet variant for secondary paths.', orbCtaRow, { states: orbCtaStates })}
  ${section(5, 'Section Heading', 'Eyebrow &middot; title &middot; lede &middot; meta. Meta joins the right edge on wide containers; the centered variant serves conversational moments.', sectionHeading + '<div style="height:40px"></div>' + sectionHeadingCenter)}
  ${section(6, 'Conversation Canvas', 'The stage itself: aurora-lit field with header, scrollable stage and docked actions. Shown in focus density (Discovery Session composition) at a fixed 640px shell height.', canvasDemo)}

  <footer class="board-foot">
    Meridian DS v1 &middot; tokens in <code>src/design-system/tokens.css</code> &middot; regenerate this board with <code>node scripts/build-review-board.mjs</code>. Sora/Inter render via system fallbacks here; product builds self-host the primary faces.
  </footer>
</div>
<script>${fitScript}</script>
`;

const outArg = process.argv[2];
const repoOut = join(root, 'docs/design-system/review-board.html');
mkdirSync(dirname(repoOut), { recursive: true });
writeFileSync(repoOut, `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${content}\n</body>\n</html>\n`);
console.log('wrote', repoOut);

if (outArg) {
  writeFileSync(outArg, content);
  console.log('wrote', outArg);
}
