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

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
