"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, KeyRound, LogOut, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { signOutAction } from "@/lib/profile/actions";

export interface SettingsViewProps {
  email: string;
}

/**
 * Settings is deliberately narrow in this v1: only sections backed by real,
 * working functionality are shown. Base44's reference export also has
 * Notifications, Appearance (dark mode) and Language rows, but none of
 * those have a real system behind them here — no notification-preferences
 * schema, no theme-switching implementation (the dark-mode color tokens in
 * globals.css are unused design tokens, not a wired toggle), and app-UI
 * language is explicitly out of scope (docs/dashboard-architecture.md
 * §10). Faking a working-looking toggle for a feature that does nothing
 * would be worse than not having the row. Same reasoning that dropped
 * Base44's "Premium Member" card from Profile.
 */
export function SettingsView({ email }: SettingsViewProps) {
  const [isPending, startTransition] = useTransition();
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent">("idle");

  function sendPasswordReset() {
    if (resetState !== "idle") return;
    setResetState("sending");
    const supabase = createClient();
    supabase.auth
      .resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
      .catch(() => {
        // Never reveal whether the send failed vs. succeeded — same
        // never-confirm-account-existence stance as /forgot-password.
      })
      .finally(() => setResetState("sent"));
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
          <div className="flex w-full items-center gap-4 rounded-2xl border border-border bg-bg-card p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter text-primary">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-tertiary">Email</p>
              <p className="truncate text-sm font-bold text-text-primary">{email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={resetState !== "idle"}
            className="flex w-full items-center gap-4 rounded-2xl border border-border bg-bg-card p-4 text-left transition-colors enabled:hover:bg-bg-muted disabled:cursor-default"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter text-primary">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-primary">Change Password</p>
              <p className="text-xs text-text-tertiary" aria-live="polite">
                {resetState === "sent" ? `Reset link sent to ${email}` : "Send a reset link to your email"}
              </p>
            </div>
            {resetState === "sent" && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />}
          </button>
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
