"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";

interface Props {
  targetCefrLevel: string;
  disabled?: boolean;
}

export function MockStartButton({ targetCefrLevel, disabled }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mock/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCefrLevel }),
      });
      const data = await res.json() as { attemptId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to start mock");
      router.push(`/mock/${data.attemptId}/reading`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <button
        onClick={handleStart}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2.5 rounded-2xl bg-primary px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition-all hover:bg-primary-dark hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ClipboardList className="h-4.5 w-4.5" aria-hidden="true" />
        {loading ? "Preparing exam…" : "Start Full Mock"}
      </button>
      {!disabled && (
        <p className="text-[11px] text-text-tertiary">
          ~55 minutes · answers auto-saved
        </p>
      )}
    </div>
  );
}
