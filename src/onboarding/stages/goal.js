// ============================================================
// goal.js — Stage: Goal Selection
// ============================================================
// Single-select. Options and default reuse the existing, already
// product-approved goal set from the Sprint 1 plan step so this
// stage doesn't invent new copy the Blueprint hasn't reviewed.
// collect() returns { targetGoal } matching
// profileBuilder's plan.targetGoal input exactly.

import { createStage } from './stageDescriptor.js';
import { createChipGroup } from './shared/chipGroup.js';

const STAGE_ID = 'goal';

export const GOAL_OPTIONS = Object.freeze([
  { value: 'General English', icon: '🌍', label: 'General English', description: 'Everyday fluency & vocabulary' },
  { value: 'IELTS Preparation', icon: '🎓', label: 'IELTS Preparation', description: 'Score higher on Academic IELTS' },
  { value: 'Business English', icon: '💼', label: 'Business English', description: 'Meetings, emails & presentations' },
  { value: 'Speaking Fluency', icon: '💬', label: 'Speaking Fluency', description: 'Pronunciation & active conversation' },
  { value: 'Travel English', icon: '✈️', label: 'Travel English', description: 'Airport, hotels & navigation context' },
  { value: 'Academic English', icon: '📚', label: 'Academic English', description: 'Lectures, research & reading' },
]);

const DEFAULT_GOAL = 'General English';
const GOAL_VALUES = GOAL_OPTIONS.map(option => option.value);

let containerRef = null;
let chipGroupHandle = null;

function resolveInitialSelection(initialData) {
  const targetGoal = initialData?.targetGoal;
  return GOAL_VALUES.includes(targetGoal) ? [targetGoal] : [DEFAULT_GOAL];
}

function render(ctx) {
  containerRef.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ob2-stage ob2-stage--goal';
  wrapper.innerHTML = `
    <span class="ob2-badge">Your goal</span>
    <h1 class="ob2-heading">What's your main goal?</h1>
    <p class="ob2-subtext">We'll tailor your roadmap and lesson recommendations around this.</p>
    <div class="ob2-chip-mount" data-role="goal-options"></div>
  `;
  containerRef.appendChild(wrapper);

  const chipMount = wrapper.querySelector('[data-role="goal-options"]');
  chipGroupHandle = createChipGroup({
    container: chipMount,
    options: GOAL_OPTIONS,
    multi: false,
    initialSelected: resolveInitialSelection(ctx?.initialData),
    groupLabel: 'Learning goal options',
    onChange: () => ctx?.onChange?.(),
  });
}

export const goalStage = createStage({
  id: STAGE_ID,

  mount(ctx) {
    containerRef = ctx.container;
    render(ctx);
  },

  validate() {
    return (chipGroupHandle?.getSelected().length ?? 0) === 1;
  },

  collect() {
    return { targetGoal: chipGroupHandle?.getSelected()[0] ?? null };
  },

  unmount() {
    chipGroupHandle?.destroy();
    chipGroupHandle = null;
    if (containerRef) containerRef.innerHTML = '';
    containerRef = null;
  },
});
