"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { choosePostLoginDestination, buildGoogleCallbackUrl } from "@/lib/auth/redirect";
import { Tuto } from "@/components/mascot/Tuto";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Props {
  /** Desired post-auth destination from ?redirectTo. Sanitized server-side before passing here. */
  redirectTo?: string;
  /** Error message pre-populated from ?error query param (e.g. oauth_failed). */
  initialError?: string;
}

export function LoginForm({ redirectTo, initialError }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.user) {
      setError(signInError?.message || "Invalid email or password");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", signInData.user.id)
      .single();

    router.push(choosePostLoginDestination(profile?.onboarding_completed ?? false, redirectTo));
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    const supabase = createClient();
    // Safely forward the intended post-auth destination through `next` so
    // the callback route can apply the same onboarding gate and redirect logic.
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildGoogleCallbackUrl(window.location.origin, redirectTo),
      },
    });
    // signInWithOAuth navigates the browser away; if it somehow returns, clear loading.
    setGoogleLoading(false);
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

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-badge text-text-tertiary">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Google sign-in */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-white text-small font-semibold text-text-primary shadow-sm transition hover:bg-bg-muted disabled:opacity-60"
        >
          {googleLoading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-text-tertiary border-t-transparent" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </button>

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

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
