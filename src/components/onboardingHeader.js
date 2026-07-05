// ============================================================
// components/onboardingHeader.js — brand lockup + step-dot progress
//
// Shared header for onboarding phases 02-09 (components.md's
// <HeaderNav>). 01-authentication does NOT use this — its own
// layout.md nests the brand lockup inside the left hero column only,
// with no step indicator (it's the gateway screen, not a numbered
// onboarding step).
// ============================================================

// step: the current phase's number (2-9, matching the numbered circle
// shown in its own reference). totalDots: how many dots to render after
// the badge — 7 covers steps 2-8 (personalized-learning-plan/step 9 is
// the post-onboarding destination, not part of the tracked sequence).
export function OnboardingHeader({ step, totalDots = 7 } = {}) {
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

  const badge = document.createElement('div');
  badge.className = 'ds-step-badge';
  badge.textContent = String(step);
  dots.appendChild(badge);

  for (let i = 0; i < totalDots - 1; i++) {
    const dot = document.createElement('div');
    dot.className = i === 0 ? 'ds-step-dot is-next' : 'ds-step-dot';
    dots.appendChild(dot);
  }

  header.append(brand, dots);
  return header;
}
