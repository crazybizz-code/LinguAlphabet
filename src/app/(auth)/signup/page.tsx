"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Tuto } from "@/components/mascot/Tuto";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

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
    const { error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message || "Registration failed");
      setLoading(false);
      return;
    }

    router.push("/welcome");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-white to-slate-50 px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/login" className="mb-6 inline-flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
              <span className="text-xl font-bold text-text-on-primary">L</span>
            </div>
          </Link>
          <Tuto pose="celebrating" size="md" animation="breathe" className="mx-auto mb-4" />
          <h1 className="font-heading text-h1 font-extrabold text-text-primary">Create your account</h1>
          <p className="mt-1 text-small text-text-secondary">Start your English journey today</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />

          {error && (
            <div role="alert" className="rounded-2xl border border-danger/15 bg-danger/10 px-4 py-3 text-small text-danger">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="h-12" block loading={loading} arrow>
            Create Account
          </Button>
        </form>

        <p className="mt-6 text-center text-small text-text-secondary">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:text-primary-dark">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
