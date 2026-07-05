// ============================================================
// screens/onboarding/_phase03Placeholder.js
//
// TEMPORARY. Phase 03 (Display Name) has not been implemented yet —
// per the one-phase-at-a-time workflow, only Phase 02 was built in
// this pass. This stub exists solely so Phase 02's documented
// "route to Phase 3 on Continue" screen-push transition is a real,
// testable navigation rather than a dead end.
//
// Delete this file once screens/onboarding/displayName.js (or
// equivalent) is actually built.
// ============================================================

export function mount(container) {
  container.classList.add('ds-screen--centered');
  container.innerHTML = `
    <div style="margin: auto; text-align: center; color: var(--text-secondary); font-family: var(--font);">
      <p class="txt-h2" style="color: var(--text-primary); margin-bottom: 8px;">Phase 02 complete ✓</p>
      <p class="txt-body">Phase 03 (Display Name) hasn't been built yet.</p>
    </div>
  `;
  return {};
}
