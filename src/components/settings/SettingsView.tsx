"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Bell, CheckCircle2, KeyRound, LogOut, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { StatRow } from "@/components/ui/StatRow";
import { signOutAction } from "@/lib/profile/actions";
import {
  getNotificationPermission,
  hasActivePushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";

export interface SettingsViewProps {
  email: string;
}

/**
 * Settings is deliberately narrow in this v1: only sections backed by real,
 * working functionality are shown. Base44's reference export also has
 * Appearance (dark mode) and Language rows, but neither has a real system
 * behind it here — no theme-switching implementation (the dark-mode color
 * tokens in globals.css are unused design tokens, not a wired toggle), and
 * app-UI language is explicitly out of scope (docs/dashboard-architecture.md
 * §10). Faking a working-looking toggle for a feature that does nothing
 * would be worse than not having the row. Same reasoning that dropped
 * Base44's "Premium Member" card from Profile.
 *
 * Notifications (Execution Sprint P2) is the one addition to that stance:
 * the retention audit named this exact screen as "where a Reminders
 * control belongs and conspicuously isn't" — src/lib/push/client.ts is a
 * real, working Web Push subscribe/unsubscribe flow, not a placeholder.
 */
export function SettingsView({ email }: SettingsViewProps) {
  const [isPending, startTransition] = useTransition();
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [pushState, setPushState] = useState<"checking" | "unsupported" | "on" | "off" | "denied" | "error">("checking");
  const [pushErrorMessage, setPushErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Deferred via a microtask rather than called synchronously in the
    // effect body: isPushSupported()/getNotificationPermission() only run
    // client-side anyway (this is "use client"), but resolving all three
    // checks — including the two synchronous ones — through the same
    // async continuation keeps this a single, ordinary "ask the external
    // system, then setState" effect instead of a synchronous state write
    // during the render commit.
    Promise.resolve().then(async () => {
      if (!isPushSupported()) {
        if (!cancelled) setPushState("unsupported");
        return;
      }
      if (getNotificationPermission() === "denied") {
        if (!cancelled) setPushState("denied");
        return;
      }
      const active = await hasActivePushSubscription();
      if (!cancelled) setPushState(active ? "on" : "off");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePush() {
    if (pushState === "on") {
      setPushState("checking");
      await unsubscribeFromPush().catch(() => {});
      setPushState("off");
      return;
    }
    if (pushState !== "off") return;

    setPushState("checking");
    try {
      await subscribeToPush();
      setPushState("on");
    } catch (error) {
      setPushErrorMessage(error instanceof Error ? error.message : "Couldn't enable notifications.");
      setPushState(getNotificationPermission() === "denied" ? "denied" : "error");
    }
  }

  function sendPasswordReset() {
    if (resetState === "sending" || resetState === "sent") return;
    setResetState("sending");
    const supabase = createClient();
    supabase.auth
      .resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
      .then(({ error }) => {
        // supabase-js resolves (rather than rejects) even on an API-level
        // failure — the promise only rejects on a true network exception.
        // Checking `error` here is what actually catches a real send
        // failure; a nonexistent email still resolves with error: null (no
        // account-existence leak either way), so this stays honest without
        // revealing whether the address is real.
        setResetState(error ? "error" : "sent");
      })
      .catch(() => {
        setResetState("error");
      });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 md:py-10">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-3"
      >
        <Link
          href="/profile"
          aria-label="Back to Profile"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-card transition-colors hover:bg-bg-muted"
        >
          <ArrowLeft className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Settings</h1>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-8"
      >
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Account</h3>
        <div className="flex flex-col gap-3">
          <StatRow icon={<Mail className="h-5 w-5" aria-hidden="true" />} label="Email" value={email} />
          <StatRow
            icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
            label="Change Password"
            value={
              resetState === "sent"
                ? `Reset link sent to ${email}`
                : resetState === "error"
                  ? "Couldn't send the reset link — tap to try again"
                  : "Send a reset link to your email"
            }
            onClick={sendPasswordReset}
            disabled={resetState === "sending" || resetState === "sent"}
            liveValue
            trailing={
              resetState === "sent" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              ) : resetState === "error" ? (
                <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
              ) : undefined
            }
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="mt-8"
      >
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Notifications</h3>
        <div className="flex flex-col gap-3">
          <StatRow
            icon={<Bell className="h-5 w-5" aria-hidden="true" />}
            label="Streak Reminders"
            value={
              pushState === "checking"
                ? "Checking…"
                : pushState === "unsupported"
                  ? "Not supported in this browser"
                  : pushState === "denied"
                    ? "Blocked — allow notifications for this site in your browser settings"
                    : pushState === "on"
                      ? "On for this device"
                      : pushState === "error"
                        ? pushErrorMessage
                        : "Get a reminder before you lose your streak"
            }
            onClick={pushState === "on" || pushState === "off" || pushState === "error" ? togglePush : undefined}
            disabled={pushState === "checking"}
            liveValue
            trailing={
              pushState === "on" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              ) : pushState === "denied" || pushState === "error" ? (
                <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
              ) : pushState === "unsupported" ? null : undefined
            }
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8"
      >
        <Button variant="secondary" block disabled={isPending} onClick={() => startTransition(() => signOutAction())}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign Out
        </Button>
      </motion.section>
    </div>
  );
}
