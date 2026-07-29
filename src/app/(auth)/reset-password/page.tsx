"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Tuto } from "@/components/mascot/Tuto";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkStatus, setLinkStatus] = useState<"checking" | "valid" | "invalid">("checking");

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.push("/login"), 2000);
    return () => clearTimeout(timer);
  }, [success, router]);

  // The emailed reset link only establishes a session in the browser that
  // requested it (PKCE flow) — opening it on a different device, or after
  // it's expired/already used, leaves this page with no session at all.
  // Without this check the form rendered anyway and only failed with a
  // generic error after the learner had already filled in a new password.
  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        settled = true;
        setLinkStatus("valid");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!settled && session) {
        settled = true;
        setLinkStatus("valid");
      }
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setLinkStatus("invalid");
      }
    }, 4000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!password || !confirmPassword) {
      setError("Enter and confirm your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || "Failed to reset password");
      setLoading(false);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-white to-bg-muted px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-soft">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Password Reset!</h1>
          <p className="mt-2 text-small text-text-secondary">Redirecting you to sign in...</p>
        </div>
      </div>
    );
  }

  if (linkStatus === "checking") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-white to-bg-muted px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <Tuto pose="thinking" size="md" animation="breathe" priority className="mx-auto mb-6" />
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Verifying your link...</h1>
          <p className="mt-2 text-small text-text-secondary">This will only take a moment.</p>
        </div>
      </div>
    );
  }

  if (linkStatus === "invalid") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-white to-bg-muted px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
            <AlertCircle className="h-8 w-8 text-danger" />
          </div>
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Link expired or invalid</h1>
          <p className="mt-2 mb-6 text-small text-text-secondary">
            This password reset link is no longer valid — it may have expired, already been used, or been opened on
            a different device than the one that requested it. Request a new one to continue.
          </p>
          <Link href="/forgot-password">
            <Button variant="primary" className="h-11 rounded-full px-6">
              Request a new link
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-white to-bg-muted px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/login" className="mb-6 inline-flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
              <span className="text-xl font-bold text-text-on-primary">L</span>
            </div>
          </Link>
          <Tuto pose="thinking" size="md" animation="breathe" priority className="mx-auto mb-4" />
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Set new password</h1>
          <p className="mt-1 text-small text-text-secondary">Choose a strong password for your account</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="New Password"
            id="newPassword"
            type={showPassword ? "text" : "password"}
            fieldSize="compact"
            icon={<Lock className="h-4 w-4" />}
            placeholder="At least 6 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-text-tertiary hover:text-text-secondary"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <Input
            label="Confirm Password"
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            fieldSize="compact"
            icon={<Lock className="h-4 w-4" />}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />

          {error && (
            <div role="alert" className="rounded-2xl border border-danger/15 bg-danger/10 px-4 py-3 text-small text-danger">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="h-12" block loading={loading}>
            Reset Password
          </Button>
        </form>
      </div>
    </div>
  );
}
