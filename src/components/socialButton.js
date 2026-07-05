// ============================================================
// components/socialButton.js — "Continue with Google/Apple" button
// See styles/components.css for the visual language (.ds-social-btn).
//
// Two variants because the handoff's mobile mockup genuinely differs
// from desktop here, not just in layout: desktop shows a short label
// with a brand icon ("Google"), mobile shows the full phrase with no
// icon ("Continue with Google"). See 01-authentication/mobile.png vs
// desktop.png.
// ============================================================

const ICONS = {
  google: `<svg viewBox="0 0 20 20" width="18" height="18"><path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.24c1.9-1.75 2.96-4.32 2.96-7.32z"/><path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.24-2.5c-.9.6-2.06.95-3.38.95-2.6 0-4.8-1.75-5.59-4.11H1.06v2.59A10 10 0 0 0 10 20z"/><path fill="#FBBC05" d="M4.41 11.92A5.99 5.99 0 0 1 4.09 10c0-.67.11-1.32.32-1.92V5.49H1.06A10 10 0 0 0 0 10c0 1.61.39 3.14 1.06 4.51z"/><path fill="#EA4335" d="M10 3.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87C14.95.99 12.7 0 10 0 6.09 0 2.7 2.24 1.06 5.49l3.35 2.59C5.2 5.71 7.4 3.96 10 3.96z"/></svg>`,
  apple: `<svg viewBox="0 0 20 20" width="18" height="18"><path fill="#000000" d="M15.77 10.6c-.03-2.1 1.7-3.1 1.78-3.16-.97-1.42-2.48-1.62-3.02-1.64-1.28-.13-2.5.75-3.15.75-.65 0-1.65-.73-2.72-.71-1.4.02-2.7.81-3.42 2.06-1.46 2.53-.37 6.28 1.05 8.33.7 1 1.53 2.13 2.62 2.09 1.05-.04 1.45-.68 2.72-.68 1.27 0 1.63.68 2.74.66 1.13-.02 1.85-1.02 2.54-2.03.8-1.17 1.13-2.3 1.15-2.36-.03-.01-2.2-.85-2.29-3.31z"/><path fill="#000000" d="M13.68 4.2c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.44 1.24-.54.61-1.01 1.6-.88 2.55.93.07 1.88-.47 2.46-1.14z"/></svg>`
};

const LABELS = {
  google: { short: 'Google', full: 'Continue with Google' },
  apple: { short: 'Apple', full: 'Continue with Apple' }
};

export function SocialButton({ provider, variant = 'icon', onClick } = {}) {
  if (!ICONS[provider]) {
    throw new Error(`SocialButton: unknown provider "${provider}" (expected "google" or "apple")`);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ds-social-btn';

  if (variant === 'icon') {
    btn.innerHTML = `${ICONS[provider]}<span>${LABELS[provider].short}</span>`;
  } else {
    btn.innerHTML = `<span>${LABELS[provider].full}</span>`;
  }

  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
