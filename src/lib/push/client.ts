"use client";

/**
 * Browser-side Web Push helpers (Execution Sprint P2). Every function
 * here is safe to call from a Client Component; none of it touches
 * Supabase directly — subscribe()/unsubscribe() below hit the two API
 * routes (src/app/api/push/{subscribe,unsubscribe}), which are the only
 * places that write push_subscriptions.
 */

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** "granted" | "denied" | "default" — mirrors the real Notification.permission, no fabricated state. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * Registers the service worker, asks for notification permission if not
 * already decided, subscribes with the VAPID public key, and persists the
 * subscription server-side. Throws with a message safe to show the
 * learner directly (e.g. "You blocked notifications for this site") —
 * callers decide how to surface it.
 */
export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) throw new Error("Push notifications aren't supported in this browser.");

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error("Push notifications aren't configured yet.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("You'll need to allow notifications in your browser to enable this.");

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!response.ok) throw new Error("Couldn't save your notification preference. Try again.");
}

/** Unsubscribes the current device both locally and server-side. Safe to call even if never subscribed. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

/** Whether this exact device already has an active push subscription — used to render the Settings toggle honestly on load. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
}
