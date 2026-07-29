"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, LogOut, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { StatRow } from "@/components/ui/StatRow";
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
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");

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
