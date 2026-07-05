# Screens

This directory is intentionally empty until screen implementation is
approved. Each screen module built here should follow one convention:

```js
export function mount(container, params) {
  // build DOM into `container`, wire events, subscribe to store.js

  return {
    unmount() { /* remove listeners/subscriptions, if any */ },
    update(patch) { /* optional: respond to router-driven param changes */ }
  };
}
```

`router.js` is the only caller of `mount()`/`unmount()` — screens never
import or call into one another directly. Shared UI comes from
`src/components/*`; shared visual language comes from
`src/styles/components.css`; shared motion comes from `src/animation.js`.

Planned first slice: `screens/onboarding/` (Tuto Welcome → Display Name →
Level Selection → Confidence → Adaptive Assessment → AI Analysis →
Learning Plan), per the Founder Onboarding spec.
