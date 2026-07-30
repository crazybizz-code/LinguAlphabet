// LinguABC Web Push service worker (Execution Sprint P2).
// Deliberately minimal — no offline caching, no asset precaching. Its
// only job is receiving push events the browser already woke it up for
// and turning them into a real OS notification, plus routing a tap on
// that notification back into the app. Registered on demand from
// src/lib/push/client.ts, not on every page load.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "LinguABC", {
      body: payload.body || "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: payload.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "/dashboard";

  // Product Intelligence Sprint — the only direct evidence a return visit
  // was actually caused by this notification (see events.ts's
  // notification_clicked doc comment). Posted directly rather than
  // through src/lib/analytics/client.ts: that module is "use client"
  // React code, not reachable from a service worker's own global scope.
  // credentials: "include" carries the same-origin session cookie so
  // /api/analytics/track can resolve which learner clicked.
  const trackClick = fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: "notification_clicked", properties: {} }),
  }).catch(() => {});

  event.waitUntil(
    Promise.all([
      trackClick,
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      }),
    ]),
  );
});
