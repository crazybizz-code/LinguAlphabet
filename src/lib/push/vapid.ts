import webpush from "web-push";

/**
 * Server-only Web Push setup. Every caller (subscribe route, cron route)
 * goes through isPushConfigured() first — without real VAPID keys set
 * (local dev, or before the operator has generated + deployed them),
 * push is simply unavailable rather than a hard crash, same posture as
 * every other optional-integration check in this codebase (e.g.
 * CRON_SECRET being optional locally).
 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Sends one push notification to one stored subscription. Returns
 * whether the subscription is still valid — a 404/410 from the push
 * service means the browser unsubscribed or the endpoint expired, and
 * the caller (the cron route) deletes that row rather than retrying it
 * forever.
 */
export async function sendPush(
  subscription: PushSubscriptionRow,
  payload: PushPayload,
): Promise<{ delivered: boolean; expired: boolean }> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
    );
    return { delivered: true, expired: false };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    return { delivered: false, expired: statusCode === 404 || statusCode === 410 };
  }
}
