// ============================================================
// screens/onboarding/tutoWelcome.js — Phase 02: Tuto Welcome
//
// Pixel spec: 02-tuto-welcome/{design,mobile}.png, prompt.md,
// interaction.md, notes.md, layout.md, responsive.md (v1.1).
//
// assets.md for this phase is mislabeled in the Design Handoff (its
// content is actually 04-level-selection's level-emoji/color tokens,
// not anything relevant to this screen) — disregarded as a handoff
// packaging error, not a real requirement; prompt.md/interaction.md/
// notes.md carry this phase's real spec.
//
// Out of scope / flagged (see completion report for full list):
//   - Mascot blink / wing-gesture idle micro-animations (interaction.md
//     asks for these, but there's no official asset layer to isolate
//     an eye or wing from the flattened PNG pose — faking it would mean
//     drawing new artwork over Tuto, which the asset package forbids)
//   - Background leaf/plant illustration flourishes visible in the
//     reference (same omission already accepted in Phase 01 — decorative
//     texture, not a documented requirement in any prompt.md)
// ============================================================

import './tutoWelcome.css';
import { MascotHero } from '../../components/mascotHero.js';
import { OnboardingHeader } from '../../components/onboardingHeader.js';
import { Card } from '../../components/card.js';
import { Button } from '../../components/button.js';
import { replace } from '../../router.js';
import { fadeSlideIn, slidePush, prefersReducedMotion, EASE } from '../../animation.js';
import * as Phase03 from './_phase03Placeholder.js';

// Each run is { t: text, accent: true|false }. Split into lines so the
// greeting/body render as separate block lines, matching the reference.
const GREETING_LINES = [
  [{ t: 'Hello! 👋' }],
  [{ t: "I'm " }, { t: 'Tuto.', accent: true }]
];

const BODY_LINES = [
  [{ t: "I'll be your personal " }, { t: 'English coach.', accent: true }],
  [{ t: "I'm excited to help you become fluent." }],
  [{ t: "Let's " }, { t: 'get to know', accent: true }, { t: ' each other first.' }]
];

// Builds the final DOM (headings/paragraphs/accent spans) up front, with
// every individual character wrapped in its own opacity:0 span — the
// typewriter effect is then just revealing pre-built spans in order,
// never mutating text content, so the accent-span structure can't drift
// from what's finally shown.
function buildTypewriterBlock(lines, tag, lineClass) {
  const frag = document.createDocumentFragment();
  const charSpans = [];
  lines.forEach(line => {
    const lineEl = document.createElement(tag);
    if (lineClass) lineEl.className = lineClass;
    line.forEach(run => {
      const host = run.accent ? document.createElement('span') : lineEl;
      if (run.accent) host.className = 'tuto-accent';
      Array.from(run.t).forEach(ch => {
        const charEl = document.createElement('span');
        charEl.className = 'tuto-char';
        charEl.textContent = ch;
        host.appendChild(charEl);
        charSpans.push(charEl);
      });
      if (run.accent) lineEl.appendChild(host);
    });
    frag.appendChild(lineEl);
  });
  return { frag, charSpans };
}

// interaction.md: "Character-by-character reveal at 28ms/char (850ms
// start delay)"; notes.md: "skip-able if the user taps anywhere on the
// speech card, immediately displaying full text and revealing Continue."
// Returns a `skip()` you can wire to a click handler.
function typewriter(charSpans, { charDelay = 28, startDelay = 850, onDone } = {}) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onDone();
  };

  if (prefersReducedMotion()) {
    charSpans.forEach(s => s.classList.add('is-shown'));
    setTimeout(finish, 200);
    return () => finish();
  }

  const timers = charSpans.map((span, i) =>
    setTimeout(() => span.classList.add('is-shown'), startDelay + i * charDelay)
  );
  timers.push(setTimeout(finish, startDelay + charSpans.length * charDelay + 150));

  return () => {
    timers.forEach(clearTimeout);
    charSpans.forEach(s => s.classList.add('is-shown'));
    finish();
  };
}

export function mount(container) {
  container.classList.add('ds-onboarding-shell');

  const header = OnboardingHeader({ step: 2 });
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'ds-screen--split ds-onboarding-body tuto-welcome-body';

  // ---- Left: Tuto hero ----
  const hero = document.createElement('div');
  hero.className = 'ds-split-hero tuto-welcome-hero';

  // notes.md: "Tuto MUST occupy 35-40% of the screen height/visual
  // weight." 320 measures at ~39% against this phase's hero panel —
  // see completion report.
  const mascotWrap = MascotHero({
    pose: 'wave',
    size: 320,
    glow: true,
    altText: 'Tuto waving hello',
    className: 'tuto-welcome-mascot'
  });
  hero.appendChild(mascotWrap);

  // ---- Right: speech card + Continue ----
  const panel = document.createElement('div');
  panel.className = 'ds-split-panel tuto-welcome-panel';

  const card = Card({ className: 'ds-card--hero-shadow tuto-speech-card' });

  const greeting = buildTypewriterBlock(GREETING_LINES, 'div', 'tuto-greeting-line');
  const greetingWrap = document.createElement('div');
  greetingWrap.className = 'tuto-greeting';
  greetingWrap.appendChild(greeting.frag);

  const body_ = buildTypewriterBlock(BODY_LINES, 'p', null);
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'tuto-body';
  bodyWrap.appendChild(body_.frag);

  card.append(greetingWrap, bodyWrap);

  // Starts disabled (not just visually hidden): otherwise it's a
  // keyboard-focusable, Enter-activatable control sitting at opacity:0
  // before the dialogue finishes, which is a real trap for keyboard/
  // screen-reader users even though pointer users only see it appear.
  const continueBtn = Button({ label: 'Continue', variant: 'primary', arrow: true, disabled: true });
  continueBtn.classList.add('tuto-continue-btn');
  continueBtn.style.opacity = '0';

  panel.append(card, continueBtn);
  body.append(hero, panel);
  container.appendChild(body);

  // ---- Typewriter + skip (tap card, or Enter/Space anywhere —
  // notes.md only specifies tap, but a keyboard-only path is needed for
  // the same reason the Continue button can't just be tab-invisible) ----
  const allCharSpans = [...greeting.charSpans, ...body_.charSpans];
  const skip = typewriter(allCharSpans, {
    onDone() {
      continueBtn.disabled = false;
      setTimeout(() => fadeSlideIn(continueBtn, { duration: 300, easing: EASE.standard }), 150);
    }
  });
  card.addEventListener('click', () => skip());
  function handleSkipKey(e) {
    if (e.key === 'Enter' || e.key === ' ') skip();
  }
  window.addEventListener('keydown', handleSkipKey);

  // ---- Continue -> Phase 03 ----
  async function handleContinue() {
    // interaction.md: "speech bubble fades (150ms), Tuto glides left
    // (-120px, 300-600ms), screen pushes left (450ms)".
    card.style.transition = 'opacity 150ms ease';
    card.style.opacity = '0';
    mascotWrap.style.transition = 'transform 450ms ' + EASE.push;
    mascotWrap.style.transform = 'translate3d(-120px, 0, 0)';

    setTimeout(() => {
      replace(Phase03, {}, { transition: slidePush });
    }, prefersReducedMotion() ? 0 : 300);
  }
  continueBtn.addEventListener('click', handleContinue);

  // ---- Entrance animation (interaction.md) ----
  fadeSlideIn(header, { delay: 150, duration: 250, easing: EASE.out, fromY: -12 });
  fadeSlideIn(mascotWrap, { delay: 300, duration: 600, easing: EASE.spring, fromY: 32, fromScale: 0.92 });

  const badgeEls = [...mascotWrap.querySelectorAll('.ds-mascot-badge')];
  const badgeDelays = [550, 620, 690, 760];
  badgeEls.forEach((el, i) => {
    fadeSlideIn(el, { delay: badgeDelays[i] ?? 760, duration: 400, easing: EASE.spring, fromY: 8, fromScale: 0.7 });
  });

  fadeSlideIn(card, { delay: 600, duration: 350, easing: EASE.out, fromY: 16, fromScale: 0.95 });

  return {
    unmount() {
      window.removeEventListener('keydown', handleSkipKey);
    }
  };
}
