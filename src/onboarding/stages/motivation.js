// ============================================================
// motivation.js — Stage: Motivation
// ============================================================
// Product decision: supports BOTH Quick Motivation Tags (multi-select)
// AND Free Text simultaneously — neither replaces the other. Tag
// vocabulary reuses the existing, already product-approved "why are
// you learning English" options from the Sprint 1 welcome step
// (extended to multi-select) pending Blueprint confirmation of the
// exact tag list.
//
// [ASSUMPTION] validate() requires at least one of {a tag, free text}
// so the stage can't be submitted completely empty; the Blueprint's
// exact required-ness for this stage was not available to confirm
// against.
//
// collect() returns { tags, freeText } matching profileBuilder's
// motivation input exactly.
//
// createMotivationStage() is exported alongside the `motivationStage`
// singleton (same factory+singleton pattern as onboarding/store.js)
// so each instance's DOM/selection/text state lives in its own
// closure — this stage has the most mutable state of the five, so
// isolating it per-instance is the most valuable here.

import { createStage } from './stageDescriptor.js';
import { createChipGroup } from './shared/chipGroup.js';

const STAGE_ID = 'motivation';
const FREE_TEXT_MAX_LENGTH = 280;
const FREE_TEXT_ID = 'ob2-motivation-freetext';

export const MOTIVATION_TAGS = Object.freeze([
  { value: 'Career', icon: '💼', label: 'Career & Job Opportunities' },
  { value: 'School', icon: '🏫', label: 'School Education' },
  { value: 'University', icon: '🎓', label: 'University Studies' },
  { value: 'Travel', icon: '✈️', label: 'Travel & Tourism' },
  { value: 'Personal Growth', icon: '🌱', label: 'Personal Growth & Culture' },
]);

export function createMotivationStage() {
  let containerRef = null;
  let chipGroupHandle = null;
  let textareaRef = null;
  let counterRef = null;
  let freeTextValue = '';
  let handleInput = null;

  function updateCounter() {
    if (counterRef) {
      counterRef.textContent = `${freeTextValue.length}/${FREE_TEXT_MAX_LENGTH}`;
    }
  }

  function render(ctx) {
    containerRef.innerHTML = '';
    freeTextValue = typeof ctx?.initialData?.freeText === 'string' ? ctx.initialData.freeText : '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ob2-stage ob2-stage--motivation';
    wrapper.innerHTML = `
      <span class="ob2-badge">Your motivation</span>
      <h1 class="ob2-heading">What's motivating you to learn English?</h1>
      <p class="ob2-subtext">Pick anything that applies, and tell us more in your own words if you'd like.</p>
      <div class="ob2-chip-mount" data-role="motivation-tags"></div>
      <div class="ob2-freetext-field">
        <label for="${FREE_TEXT_ID}">In your own words (optional)</label>
        <textarea
          id="${FREE_TEXT_ID}"
          class="ob2-freetext-input"
          maxlength="${FREE_TEXT_MAX_LENGTH}"
          placeholder="e.g. I want to feel confident in work meetings"
          aria-describedby="${FREE_TEXT_ID}-count"
        ></textarea>
        <span id="${FREE_TEXT_ID}-count" class="ob2-freetext-count"></span>
      </div>
    `;
    containerRef.appendChild(wrapper);

    const chipMount = wrapper.querySelector('[data-role="motivation-tags"]');
    const initialTags = Array.isArray(ctx?.initialData?.tags) ? ctx.initialData.tags : [];
    chipGroupHandle = createChipGroup({
      container: chipMount,
      options: MOTIVATION_TAGS,
      multi: true,
      initialSelected: initialTags,
      groupLabel: 'Quick motivation tags',
      onChange: () => ctx?.onChange?.(),
    });

    textareaRef = wrapper.querySelector(`#${FREE_TEXT_ID}`);
    counterRef = wrapper.querySelector(`#${FREE_TEXT_ID}-count`);
    textareaRef.value = freeTextValue;
    updateCounter();

    handleInput = () => {
      freeTextValue = textareaRef.value;
      updateCounter();
      ctx?.onChange?.();
    };
    textareaRef.addEventListener('input', handleInput);
  }

  return createStage({
    id: STAGE_ID,

    mount(ctx) {
      containerRef = ctx.container;
      render(ctx);
    },

    validate() {
      const hasTag = (chipGroupHandle?.getSelected().length ?? 0) > 0;
      const hasFreeText = freeTextValue.trim().length > 0;
      return hasTag || hasFreeText;
    },

    collect() {
      return {
        tags: chipGroupHandle?.getSelected() ?? [],
        freeText: freeTextValue.trim(),
      };
    },

    unmount() {
      chipGroupHandle?.destroy();
      chipGroupHandle = null;
      if (textareaRef && handleInput) {
        textareaRef.removeEventListener('input', handleInput);
      }
      textareaRef = null;
      counterRef = null;
      handleInput = null;
      freeTextValue = '';
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
    },
  });
}

export const motivationStage = createMotivationStage();
