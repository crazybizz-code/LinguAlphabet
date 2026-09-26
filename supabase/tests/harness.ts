/**
 * Offline Postgres harness for database-authorization tests.
 *
 * Runs a real Postgres (PGlite, in-process WASM) — never the network, never
 * the production project. It reproduces just enough of Supabase for RLS and
 * GRANT semantics to be meaningful:
 *
 *   - the `anon`, `authenticated` and `service_role` roles, with
 *     `service_role` carrying BYPASSRLS exactly like Supabase's;
 *   - `auth.users` and `auth.uid()` / `auth.role()`, where `auth.uid()`
 *     reads the same `request.jwt.claim.sub` setting PostgREST sets;
 *   - Supabase's default privileges: every table/function created in
 *     `public` is granted to anon/authenticated/service_role. This matters —
 *     it is the reason a missing RLS policy or an unrevoked column grant is
 *     an exposure at all, so the harness must start from the same
 *     permissive baseline production does.
 *
 * Then it applies the repo's own schema files, in dependency order, so the
 * policies under test are the real ones rather than a re-typed copy.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const BOOTSTRAP_SQL = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  -- uuid-ossp is not bundled with PGlite; the schema files only need
  -- uuid_generate_v4(), which gen_random_uuid() satisfies identically.
  create function public.uuid_generate_v4() returns uuid language sql volatile as $$
    select gen_random_uuid()
  $$;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

/**
 * Schema files in dependency order. Every entry must be tracked in git —
 * the suite has to pass on a clean checkout, not just on a machine that
 * happens to have uncommitted files lying around.
 *
 * streak-shield-schema.sql is deliberately
 * absent: the live database does not have profiles.streak_shields (verified
 * read-only against the PostgREST schema on 2026-09-26), and the
 * remediation migration adds it — leaving it out here keeps the harness
 * faithful to production's actual starting point.
 */
export const BASE_SCHEMA_FILES = [
  "supabase-schema.sql",
  "supabase/content-schema.sql",
  "supabase/progress-schema.sql",
  "supabase/daily-activity-schema.sql",
  "supabase/onboarding-fields.sql",
  "supabase/ielts-onboarding-fields.sql",
  "supabase/exam-date.sql",
  "supabase/placement-assessment-flag.sql",
  "supabase/profiles-assessed-level.sql",
  "supabase/assessment-schema.sql",
  "supabase/mock-group-instructions-schema.sql",
  "supabase/learning-brain-schema.sql",
  "supabase/daily-missions-finite-plan.sql",
  "supabase/learning-plans-schema.sql",
  "supabase/practice-schema.sql",
  "supabase/full-mock-schema.sql",
  // Stands in for three mock-structure files not yet tracked in git.
  "supabase/tests/fixtures/live-mock-structure.sql",
  "supabase/mock-reading-production-readiness.sql",
  "supabase/learning-signals-schema.sql",
] as const;

export const REMEDIATION_MIGRATION = "supabase/security-remediation-2026-09.sql";
export const REMEDIATION_ROLLBACK = "supabase/security-remediation-2026-09.rollback.sql";

function readRepoSql(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
    // PGlite has no uuid-ossp; the bootstrap shims the one function used.
    .replace(/create extension if not exists "uuid-ossp";/gi, "");
}

export type Role = "anon" | "authenticated" | "service_role";

export interface Harness {
  db: PGlite;
  applyFile(relativePath: string): Promise<void>;
  /** Runs `sql` as `role`, impersonating `userId` the way PostgREST does. Throws on permission/RLS errors. */
  as<T = Record<string, unknown>>(role: Role, userId: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  /** Superuser-level setup (fixtures). */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  createUser(id: string, email: string): Promise<void>;
}

export async function createHarness(options: { withRemediation: boolean }): Promise<Harness> {
  const db = new PGlite();
  await db.exec(BOOTSTRAP_SQL);

  const applyFile = async (relativePath: string) => {
    try {
      await db.exec(readRepoSql(relativePath));
    } catch (error) {
      throw new Error(`Failed to apply ${relativePath}: ${(error as Error).message}`);
    }
  };

  for (const file of BASE_SCHEMA_FILES) await applyFile(file);
  if (options.withRemediation) await applyFile(REMEDIATION_MIGRATION);

  const admin = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

  const as = async <T,>(role: Role, userId: string | null, sql: string, params: unknown[] = []) => {
    // One transaction per call so role/claims can never leak into the next
    // statement, including when `sql` fails.
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [userId ?? "", role]);
      await tx.exec(`set local role ${role}`);
      return (await tx.query<T>(sql, params)).rows;
    });
  };

  const createUser = async (id: string, email: string) => {
    // Fires the real on_auth_user_created trigger → profiles row.
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [id, email]);
  };

  return { db, applyFile, as, admin, createUser };
}
