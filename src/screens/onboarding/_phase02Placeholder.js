// ============================================================
// screens/onboarding/_phase02Placeholder.js
//
// TEMPORARY. Phase 02 (Tuto Welcome) has not been implemented yet —
// per the one-phase-at-a-time workflow, only Phase 01 was approved
// for this pass. This stub exists solely so Phase 01's documented
// "route to Phase 2 on valid submission" screen-push transition is a
// real, testable navigation rather than a dead end.
//
// Delete this file once screens/onboarding/tutoWelcome.js (or
// equivalent) is actually built.
// ============================================================

export function mount(container) {
  container.classList.add('ds-screen--centered');
  container.innerHTML = `
    <div style="margin: auto; text-align: center; color: var(--text-secondary); font-family: var(--font);">
      <p class="txt-h2" style="color: var(--text-primary); margin-bottom: 8px;">Phase 01 complete ✓</p>
      <p class="txt-body">Phase 02 (Tuto Welcome) hasn't been built yet.</p>
    </div>
  `;
  return {};
}
