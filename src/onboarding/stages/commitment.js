// ============================================================
// commitment.js — Stage: Daily Commitment
// ============================================================
// Single-select. Options and the 20-minute default reuse the
// existing, already product-approved values from the Sprint 1 plan
// step. collect() returns { dailyTimeGoalMinutes } as a number,
// matching profileBuilder's plan.dailyTimeGoalMinutes input exactly.

import { createStage } from './stageDescriptor.js';
import { createChipGroup } from './shared/chipGroup.js';

const STAGE_ID = 'commitment';

export const DAILY_COMMITMENT_MINUTES = Object.freeze([10, 20, 30, 45, 60]);
const DEFAULT_DAILY_MINUTES = 20;

const COMMITMENT_OPTIONS = Object.freeze(
  DAILY_COMMITMENT_MINUTES.map(minutes => ({ value: String(minutes), label: `${minutes} min` })),
);

let containerRef = null;
let chipGroupHandle = null;

function resolveInitialSelection(initialData) {
  const minutes = initialData?.dailyTimeGoalMinutes;
  return DAILY_COMMITMENT_MINUTES.includes(minutes)
    ? [String(minutes)]
    : [String(DEFAULT_DAILY_MINUTES)];
}

function render(ctx) {
  containerRef.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ob2-stage ob2-stage--commitment';
  wrapper.innerHTML = `
    <span class="ob2-badge">Daily commitment</span>
    <h1 class="ob2-heading">How much time can you study each day?</h1>
    <p class="ob2-subtext">Pick a pace you can keep — you can always change this later.</p>
    <div class="ob2-chip-mount" data-role="commitment-options"></div>
  `;
  containerRef.appendChild(wrapper);

  const chipMount = wrapper.querySelector('[data-role="commitment-options"]');
  chipGroupHandle = createChipGroup({
    container: chipMount,
    options: COMMITMENT_OPTIONS,
    multi: false,
    initialSelected: resolveInitialSelection(ctx?.initialData),
    groupLabel: 'Daily study time options',
    onChange: () => ctx?.onChange?.(),
  });
}

export const commitmentStage = createStage({
  id: STAGE_ID,

  mount(ctx) {
    containerRef = ctx.container;
    render(ctx);
  },

  validate() {
    return (chipGroupHandle?.getSelected().length ?? 0) === 1;
  },

  collect() {
    const selected = chipGroupHandle?.getSelected()[0];
    return { dailyTimeGoalMinutes: selected ? Number(selected) : null };
  },

  unmount() {
    chipGroupHandle?.destroy();
    chipGroupHandle = null;
    if (containerRef) containerRef.innerHTML = '';
    containerRef = null;
  },
});
