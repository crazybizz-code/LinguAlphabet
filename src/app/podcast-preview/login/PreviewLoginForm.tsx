"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PreviewLoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/podcast-preview/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (response.ok) {
        router.push(redirectTo);
      } else {
        setError("Invalid preview secret. Check the value of PREVIEW_SECRET.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-8 shadow-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Draft Preview
          </span>
        </div>
        <h1 className="mb-1 text-xl font-semibold text-text">Operator Authorization</h1>
        <p className="mb-6 text-sm text-text-secondary">
          Enter the operator preview secret to access draft content. You must also be signed in to LinguABC.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Preview secret"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text placeholder:text-text-tertiary outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={pending || !secret}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {pending ? "Authorizing…" : "Authorize Preview"}
          </button>
        </form>
      </div>
    </div>
  );
}
