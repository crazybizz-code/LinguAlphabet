// ============================================================
// level.js — Stage: English Level Selection
// ============================================================
// Product decision: self-selected levels are NEVER mapped to a
// CEFR value. The level is stored exactly as chosen. This stage
// renders the 6 canonical levels (imported from the schema module
// so the persisted vocabulary and the UI can never drift apart)
// plus a 7th "I don't know my level" option.
//
// collect() intentionally returns { selectedLevel, needsLevelAssessment }
// — the exact shape profileBuilder.buildLearningBrainProfile()'s
// `answers.level` expects, so a future machine can pass this stage's
// collect() output straight through without any translation layer.
//
// No default is pre-selected: unlike Goal/Commitment, the level is
// a meaningful self-report and must not be silently assumed.

import { createStage } from './stageDescriptor.js';
import { createChipGroup } from './shared/chipGroup.js';
import { LEARNING_LEVELS } from '../../profile/learningBrainProfile.js';

const STAGE_ID = 'level';

export const LEVEL_UNKNOWN_VALUE = 'unknown';

export const LEVEL_OPTIONS = Object.freeze([
  ...LEARNING_LEVELS.map(level => ({ value: level, label: level })),
  {
    value: LEVEL_UNKNOWN_VALUE,
    label: "I don't know my level",
    description: 'No worries — Tuto will figure it out as you learn.',
    variant: 'secondary',
  },
]);

let containerRef = null;
let chipGroupHandle = null;

function resolveInitialSelection(initialData) {
  if (!initialData) return [];
  if (initialData.needsLevelAssessment) return [LEVEL_UNKNOWN_VALUE];
  if (initialData.selectedLevel && LEARNING_LEVELS.includes(initialData.selectedLevel)) {
    return [initialData.selectedLevel];
  }
  return [];
}

function render(ctx) {
  containerRef.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ob2-stage ob2-stage--level';
  wrapper.innerHTML = `
    <span class="ob2-badge">Your level</span>
    <h1 class="ob2-heading">What's your English level?</h1>
    <p class="ob2-subtext">Pick the option that feels right — you can fine-tune it later as you learn.</p>
    <div class="ob2-chip-mount" data-role="level-options"></div>
  `;
  containerRef.appendChild(wrapper);

  const chipMount = wrapper.querySelector('[data-role="level-options"]');
  chipGroupHandle = createChipGroup({
    container: chipMount,
    options: LEVEL_OPTIONS,
    multi: false,
    initialSelected: resolveInitialSelection(ctx?.initialData),
    groupLabel: 'English level options',
    onChange: () => ctx?.onChange?.(),
  });
}

export const levelStage = createStage({
  id: STAGE_ID,

  mount(ctx) {
    containerRef = ctx.container;
    render(ctx);
  },

  validate() {
    return (chipGroupHandle?.getSelected().length ?? 0) === 1;
  },

  collect() {
    const selected = chipGroupHandle?.getSelected()[0] ?? null;
    if (selected === LEVEL_UNKNOWN_VALUE) {
      return { selectedLevel: null, needsLevelAssessment: true };
    }
    return { selectedLevel: selected, needsLevelAssessment: false };
  },

  unmount() {
    chipGroupHandle?.destroy();
    chipGroupHandle = null;
    if (containerRef) containerRef.innerHTML = '';
    containerRef = null;
  },
});
