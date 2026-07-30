"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Tuto } from "@/components/mascot/Tuto";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Intentionally ignored — never reveal whether an account exists.
    }

    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-white to-bg-muted px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <Tuto pose="thinking" size="md" animation="breathe" priority className="mx-auto mb-6" />
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Check your email</h1>
          <p className="mt-2 mb-6 text-small text-text-secondary">
            If an account exists for <span className="font-medium text-text-primary">{email}</span>, we&apos;ve
            sent a password reset link.
          </p>
          <Link href="/login">
            <Button variant="secondary" className="h-11 rounded-full px-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
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
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Forgot password?</h1>
          <p className="mt-1 text-small text-text-secondary">Enter your email and we&apos;ll send a reset link</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Email address"
            id="email"
            type="email"
            fieldSize="compact"
            icon={<Mail className="h-4 w-4" />}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />

          {error && (
            <div role="alert" className="rounded-2xl border border-danger/15 bg-danger/10 px-4 py-3 text-small text-danger">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="h-12" block loading={loading}>
            Send Reset Link
          </Button>
        </form>

        <p className="mt-6 text-center text-small text-text-secondary">
          <Link
            href="/login"
            className="-my-3.5 inline-flex items-center gap-1 py-3.5 font-medium text-primary hover:text-primary-dark"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
