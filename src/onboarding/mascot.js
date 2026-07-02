// ============================================================
// mascot.js — mascot rendering + celebration
// ============================================================
// Reuses the existing standalone mascot asset
// (public/linguAlphabet-mascot.svg — the same "Torty" design used
// elsewhere in the app) via a plain <img> reference, and the
// existing tutoBreathe/tutoCelebrate keyframes already defined in
// style.css. This module adds no new keyframes — only new wrapper
// classes (.ob2-mascot--idle, .ob2-mascot--celebrate) that apply
// them. Kept deliberately subtle: one continuous gentle idle
// breathe, and a single one-shot celebrate() bounce. No confetti,
// no particle effects, no new animation primitives invented here.

const MASCOT_SRC = '/linguAlphabet-mascot.svg';

// Matches @keyframes tutoCelebrate's declared duration in style.css.
export const CELEBRATE_ANIMATION_MS = 800;

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {string} [options.alt]
 * @returns {{ celebrate: () => void, destroy: () => void }}
 */
export function mountMascot(container, { alt = 'Tuto the mascot' } = {}) {
  if (!container) {
    throw new Error('mountMascot: container is required');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ob2-mascot ob2-mascot--idle';

  const img = document.createElement('img');
  img.className = 'ob2-mascot-img';
  img.src = MASCOT_SRC;
  img.alt = alt;

  wrapper.appendChild(img);
  container.appendChild(wrapper);

  let celebrateTimer = null;

  function celebrate() {
    if (celebrateTimer) clearTimeout(celebrateTimer);
    wrapper.classList.remove('ob2-mascot--celebrate');
    // Force a reflow so re-triggering the class restarts the CSS
    // animation even if celebrate() is called again mid-bounce.
    void wrapper.offsetWidth;
    wrapper.classList.add('ob2-mascot--celebrate');
    celebrateTimer = setTimeout(() => {
      wrapper.classList.remove('ob2-mascot--celebrate');
      celebrateTimer = null;
    }, CELEBRATE_ANIMATION_MS);
  }

  function destroy() {
    if (celebrateTimer) clearTimeout(celebrateTimer);
    celebrateTimer = null;
    wrapper.remove();
  }

  return { celebrate, destroy };
}
