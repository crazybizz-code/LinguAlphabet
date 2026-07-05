// ============================================================
// components/onboardingHeader.js — brand lockup + step-dot progress
//
// Shared header for onboarding phases 02-09 (components.md's
// <HeaderNav>). 01-authentication does NOT use this — its own
// layout.md nests the brand lockup inside the left hero column only,
// with no step indicator (it's the gateway screen, not a numbered
// onboarding step).
//
// Two variants exist because the two references built so far actually
// disagree on the visual language, not because this component invented
// two styles speculatively:
//   - 'highlight-next' (02-tuto-welcome's own reference): current-step
//     badge + one solid "up next" dot + the rest hollow. No checkmarks.
//   - 'checklist' (03-display-name's own reference, and its prompt.md
//     literally spells out "✓ ✓ (3) • • • • •"): a checkmark per
//     completed step + current badge + hollow dots for the rest.
// Each phase must keep using whichever its own reference shows —
// 02 is already approved with 'highlight-next' and must not change.
// ============================================================

const CHECK_ICON = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M4 10.5l3.5 3.5L16 5.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderHighlightNext(dots, step, totalDots) {
  const badge = document.createElement('div');
  // Bracket arcs are specific to this variant's own reference —
  // 03-display-name's plain "3" circle has no brackets at all.
  badge.className = 'ds-step-badge ds-step-badge--bracketed';
  badge.textContent = String(step);
  dots.appendChild(badge);

  for (let i = 0; i < totalDots - 1; i++) {
    const dot = document.createElement('div');
    dot.className = i === 0 ? 'ds-step-dot is-next' : 'ds-step-dot';
    dots.appendChild(dot);
  }
}

function appendDot(dots) {
  const dot = document.createElement('div');
  dot.className = 'ds-step-dot';
  dots.appendChild(dot);
}

// Grid-measured against the reference (03-display-name/design.png):
// the sequence isn't just "checks, badge, future dots" — there's a
// small connector dot between each of the big circles too (check, dot,
// check, dot, badge, dot, dot, dot, dot, dot for step 3 of 8). Visually
// indistinguishable from a "future" dot, so it's just the same element.
function renderChecklist(dots, step, totalSteps) {
  for (let i = 1; i < step; i++) {
    if (i > 1) appendDot(dots);
    const check = document.createElement('div');
    check.className = 'ds-step-badge ds-step-badge--done';
    check.innerHTML = CHECK_ICON;
    dots.appendChild(check);
  }

  if (step > 1) appendDot(dots);
  const badge = document.createElement('div');
  badge.className = 'ds-step-badge';
  badge.textContent = String(step);
  dots.appendChild(badge);

  for (let i = step + 1; i <= totalSteps; i++) {
    appendDot(dots);
  }
}

// step: the current phase's number. totalDots (highlight-next): dots
// after the badge, default 7 (steps 2-8). totalSteps (checklist): the
// full tracked range, default 8 (steps 1-8) per 03-display-name's own
// "✓ ✓ (3) • • • • •" (2 done + current + 5 upcoming = 8).
export function OnboardingHeader({ step, variant = 'highlight-next', totalDots = 7, totalSteps = 8 } = {}) {
  const header = document.createElement('header');
  header.className = 'ds-onboarding-header';

  const brand = document.createElement('div');
  brand.className = 'ds-onboarding-brand';
  brand.innerHTML = `
    <div class="ds-onboarding-logo">Lingu<span>Alphabet</span></div>
    <p class="ds-onboarding-tagline">AI Coach for Language Mastery</p>
  `;

  const dots = document.createElement('div');
  dots.className = 'ds-step-dots';

  if (variant === 'checklist') {
    renderChecklist(dots, step, totalSteps);
  } else {
    renderHighlightNext(dots, step, totalDots);
  }

  header.append(brand, dots);
  return header;
}
