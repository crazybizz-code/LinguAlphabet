// ============================================================
// screens/onboarding/displayName.js — Phase 03: Display Name
//
// Pixel spec: 03-display-name/design.png, prompt.md, interaction.md,
// notes.md, layout.md, responsive.md (v1.1). desktop.png/mobile.png
// are byte-identical to design.png in this phase's handoff folder (a
// packaging issue, same class as 02's mislabeled assets.md) — design.png
// is itself a side-by-side composite of both breakpoints, so it's the
// only reference needed; cropped its right-hand panel for the mobile
// layout instead of a separate file.
//
// Out of scope / flagged (see completion report):
//   - Eye-tracking / ear-perk / wing-sway / pupil-sparkle micro-gestures
//     from interaction.md's "Owl State Engine" — no isolated eye/ear/wing
//     layer exists in the flattened pose PNG to animate independently.
//     Approximated with whole-image transforms instead (gaze tilt on
//     focus, scale pulse on keypress, bounce on valid name) — CSS
//     transforms on the existing asset, not new artwork.
// ============================================================

import './displayName.css';
import { MascotHero } from '../../components/mascotHero.js';
import { OnboardingHeader } from '../../components/onboardingHeader.js';
import { Card } from '../../components/card.js';
import { Button, setButtonLoading } from '../../components/button.js';
import { FormInput } from '../../components/formInput.js';
import { UserState } from '../../db.js';
import { replace } from '../../router.js';
import { fadeSlideIn, shake, slidePush, prefersReducedMotion, EASE } from '../../animation.js';
import * as Phase04 from './_phase04Placeholder.js';

const PERSON_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><circle cx="10" cy="7" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 16.5c1-3.2 4-4.8 6.5-4.8s5.5 1.6 6.5 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const SPARKLE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M10 2c0 4-4 8-8 8 4 0 8 4 8 8 0-4 4-8 8-8-4 0-8-4-8-8z" fill="currentColor"/></svg>`;
const HEADPHONE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M3 11v-1a7 7 0 0 1 14 0v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="2" y="11" width="4" height="5.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="11" width="4" height="5.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/></svg>`;
const BOOK_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M10 5.2C8.8 4.3 7 3.8 5 3.8c-.9 0-1.6.08-2 .16v10.5c.4-.08 1.1-.16 2-.16 2 0 3.8.5 5 1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 5.2c1.2-.9 3-1.4 5-1.4.9 0 1.6.08 2 .16v10.5c-.4-.08-1.1-.16-2-.16-2 0-3.8.5-5 1.4V5.2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MIC_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="7" y="2.5" width="6" height="9.5" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 10.5a5.5 5.5 0 0 0 11 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 16v1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

// This phase's own reference shows a different badge set/arrangement
// than 01/02 (book top-left, Aa mid-left, headphone/mic/sparkle right)
// — overriding MascotHero's defaults rather than reusing them.
const BADGES = [
  { content: BOOK_ICON, position: 'top: 10%; left: 6%;' },
  { content: 'Aa', position: 'top: 46%; left: 2%;' },
  { content: HEADPHONE_ICON, position: 'top: 8%; right: 6%;' },
  { content: MIC_ICON, position: 'top: 48%; right: 4%;' },
  { content: SPARKLE_ICON, position: 'bottom: 12%; right: 14%;' }
];

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 32;

function TypingBadge() {
  const el = document.createElement('div');
  el.className = 'name-typing-badge';
  el.innerHTML = '<span></span><span></span><span></span>';
  return el;
}

export function mount(container) {
  container.classList.add('ds-onboarding-shell');

  const header = OnboardingHeader({ step: 3, variant: 'checklist' });
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'ds-screen--split ds-onboarding-body name-body';

  // ---- Left: Tuto hero ----
  const hero = document.createElement('div');
  hero.className = 'ds-split-hero name-hero';

  // notes.md/prompt.md: "35-40% visual hero ... attentive pose, watching
  // the input card" -> 'thinking' pose (tuto.js's documented pose map).
  const mascotWrap = MascotHero({
    pose: 'thinking',
    size: 320,
    glow: true,
    altText: 'Tuto thinking, waiting attentively',
    badges: BADGES,
    className: 'name-mascot'
  });
  hero.appendChild(mascotWrap);

  // ---- Right: speech card ----
  const panel = document.createElement('div');
  panel.className = 'ds-split-panel name-panel';

  const card = Card({ className: 'ds-card--hero-shadow name-card' });

  const typing = TypingBadge();

  const heading = document.createElement('h1');
  heading.className = 'name-heading';
  heading.innerHTML = 'Before we continue...<br>What should I call <span class="tuto-accent">you?</span>';

  const subtitle = document.createElement('p');
  subtitle.className = 'name-subtitle';
  subtitle.textContent = 'I want to make this journey personal just for you. 🧡';

  const nameInput = FormInput({
    id: 'display-name',
    type: 'text',
    placeholder: 'Enter your name...',
    iconSvg: PERSON_ICON,
    autocomplete: 'given-name'
  });
  nameInput.input.maxLength = MAX_NAME_LENGTH;

  const continueBtn = Button({ label: 'Continue', variant: 'primary', arrow: true, disabled: true });
  continueBtn.classList.add('name-continue-btn');

  card.append(typing, heading, subtitle, nameInput.el, continueBtn);

  const securityNote = document.createElement('p');
  securityNote.className = 'name-security-note';
  securityNote.innerHTML = '🔒 Your information is safe with us.';

  panel.append(card, securityNote);
  body.append(hero, panel);
  container.appendChild(body);

  // ---- Validation ----
  let wasValid = false;
  function isValid() {
    return nameInput.input.value.trim().length >= MIN_NAME_LENGTH;
  }

  function handleInput() {
    nameInput.setError(null);
    const valid = isValid();
    continueBtn.disabled = !valid;
    // Once the button has entered (see entranceBtnTimer below) it sits
    // at 0.4 opacity while disabled, per prompt.md's documented disabled
    // state, and rises to 1.0 only once a valid name is entered.
    if (continueBtn.style.opacity !== '0') {
      continueBtn.style.opacity = valid ? '1' : '0.4';
    }

    // interaction.md: "Typing Reaction: ears perk, eyes widen, wings
    // sway" — approximated as a quick scale pulse on the whole mascot
    // (no isolated ear/wing layer exists to animate independently).
    if (!prefersReducedMotion()) {
      mascotWrap.classList.remove('is-typing');
      void mascotWrap.offsetWidth;
      mascotWrap.classList.add('is-typing');
    }

    // interaction.md: "Validation Celebration: bounce + wing wave +
    // sparkle" when name first becomes valid (>=2 chars) — approximated
    // as a one-shot bounce on the mascot wrap.
    if (valid && !wasValid && !prefersReducedMotion()) {
      mascotWrap.classList.remove('is-celebrating');
      void mascotWrap.offsetWidth;
      mascotWrap.classList.add('is-celebrating');
    }
    wasValid = valid;
  }
  nameInput.input.addEventListener('input', handleInput);

  // interaction.md: "Attentive Gaze: eyes track toward the box, head
  // tilts +3deg" on focus — approximated as a whole-mascot tilt/shift.
  nameInput.input.addEventListener('focus', () => mascotWrap.classList.add('is-attentive'));
  nameInput.input.addEventListener('blur', () => mascotWrap.classList.remove('is-attentive'));

  nameInput.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !continueBtn.disabled) handleSubmit();
  });

  // ---- Submit ----
  async function handleSubmit() {
    if (!isValid()) {
      nameInput.setError('Please enter at least 2 characters.');
      shake(card);
      return;
    }

    // notes.md: "Trim leading/trailing whitespace ... capitalize the
    // first letter automatically" before persisting.
    const trimmed = nameInput.input.value.trim();
    const displayName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

    setButtonLoading(continueBtn, true);
    UserState.update({ username: displayName });

    // interaction.md: "speech bubble fades (150ms), Tuto glides left
    // (-120px, 300-600ms), viewport pushes left (450ms)".
    card.style.transition = 'opacity 150ms ease';
    card.style.opacity = '0';
    mascotWrap.style.transition = 'transform 450ms ' + EASE.push;
    mascotWrap.style.transform = 'translate3d(-120px, 0, 0)';

    setTimeout(() => {
      replace(Phase04, {}, { transition: slidePush });
    }, prefersReducedMotion() ? 0 : 300);
  }
  continueBtn.addEventListener('click', handleSubmit);

  // ---- Entrance animation (interaction.md) ----
  fadeSlideIn(header, { delay: 150, duration: 250, easing: EASE.out, fromY: -12 });
  fadeSlideIn(mascotWrap, { delay: 300, duration: 600, easing: EASE.spring, fromY: 32, fromScale: 0.92 });
  fadeSlideIn(card, { delay: 600, duration: 350, easing: EASE.out, fromY: 16, fromScale: 0.95 });
  fadeSlideIn(nameInput.el, { delay: 850, duration: 300, easing: EASE.out, fromY: 12 });

  // notes.md: "Auto-focus after entrance finishes (850ms)" — matches
  // the input's own reveal delay above.
  const focusTimer = setTimeout(() => nameInput.input.focus(), 850);

  // interaction.md: "Continue Button (Disabled): Opacity 0 -> 0.4
  // (250ms, 1800ms delay)" — lands at 0.4 (still disabled), not 1.0;
  // handleInput() takes it to 1.0 once a valid name is typed. Not
  // reusing fadeSlideIn here since its end state is hardcoded to 1.0.
  continueBtn.style.opacity = '0';
  const btnTimer = setTimeout(() => {
    continueBtn.style.transition = `opacity 250ms ${EASE.standard}`;
    continueBtn.style.opacity = isValid() ? '1' : '0.4';
  }, prefersReducedMotion() ? 0 : 1800);

  return {
    unmount() {
      clearTimeout(focusTimer);
      clearTimeout(btnTimer);
    }
  };
}
