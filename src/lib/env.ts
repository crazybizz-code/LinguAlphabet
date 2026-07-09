/**
 * Validates the public Supabase env vars once, with a clear error message,
 * instead of each of client.ts/server.ts/proxy.ts silently doing
 * `process.env.X!` — a missing var in production previously surfaced as a
 * cryptic error deep inside the Supabase SDK instead of pointing at the
 * actual cause. Next.js inlines `NEXT_PUBLIC_*` references at build time
 * for both server and client bundles, so this is safe to import from either.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Check .env against .env.example.`);
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
