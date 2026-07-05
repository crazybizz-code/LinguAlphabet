// ============================================================
// screens/onboarding/_phase04Placeholder.js
//
// TEMPORARY. Phase 04 (Level Selection) has not been implemented yet —
// per the one-phase-at-a-time workflow, only Phase 03 was built in
// this pass. This stub exists solely so Phase 03's documented
// "route to Phase 4 on Continue" screen-push transition is a real,
// testable navigation rather than a dead end.
//
// Delete this file once screens/onboarding/levelSelection.js (or
// equivalent) is actually built.
// ============================================================

export function mount(container) {
  container.classList.add('ds-screen--centered');
  container.innerHTML = `
    <div style="margin: auto; text-align: center; color: var(--text-secondary); font-family: var(--font);">
      <p class="txt-h2" style="color: var(--text-primary); margin-bottom: 8px;">Phase 03 complete ✓</p>
      <p class="txt-body">Phase 04 (Level Selection) hasn't been built yet.</p>
    </div>
  `;
  return {};
}
