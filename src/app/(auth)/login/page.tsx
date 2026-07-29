"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Tuto } from "@/components/mascot/Tuto";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.user) {
      setError(signInError?.message || "Invalid email or password");
      setLoading(false);
      return;
    }

    // A returning learner who already finished onboarding goes straight to
    // Home — only a first-time or interrupted signup goes through the
    // wizard. Previously this always sent every login to /welcome,
    // re-running onboarding (and re-overwriting the learner's real
    // level/goal/interests with the wizard's defaults) on every sign-in.
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", signInData.user.id)
      .single();

    router.push(profile?.onboarding_completed ? "/dashboard" : "/welcome");
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
          {/* `wave` is reserved for Welcome/first-time onboarding — a
              returning learner signing back in gets Tuto's normal presence. */}
          <Tuto pose="neutral" size="md" animation="float" glow priority className="mx-auto mb-4" />
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Welcome back</h1>
          <p className="mt-1 text-small text-text-secondary">Sign in to continue learning</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Email"
            id="email"
            type="email"
            fieldSize="compact"
            icon={<Mail className="h-4 w-4" />}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <Input
            label="Password"
            id="password"
            type={showPassword ? "text" : "password"}
            fieldSize="compact"
            icon={<Lock className="h-4 w-4" />}
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            labelExtra={
              // py-3.5/-my-3.5 (and p-3.5/-m-3.5 on the icon button below)
              // expand the tappable area to Apple's 44pt minimum without
              // changing the visible text/icon size or shifting surrounding
              // layout — the negative margin cancels the padding's effect
              // on flow, same technique used on every touch target fixed in
              // this pass (docs/ux-launch-audit.md P0).
              <Link
                href="/forgot-password"
                className="-my-3.5 inline-flex items-center py-3.5 text-badge font-medium text-primary hover:text-primary-dark"
              >
                Forgot password?
              </Link>
            }
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="-m-3.5 inline-flex items-center justify-center p-3.5 text-text-tertiary hover:text-text-secondary"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          {error && (
            <div role="alert" className="rounded-2xl border border-danger/15 bg-danger/10 px-4 py-3 text-small text-danger">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="h-12" block loading={loading} arrow>
            Sign In
          </Button>
        </form>

        <p className="mt-6 text-center text-small text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="-my-3.5 inline-block py-3.5 font-semibold text-primary hover:text-primary-dark">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
