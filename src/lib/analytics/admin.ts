/**
 * There is no role/permission system in LinguABC today — profiles has no
 * role/is_admin column anywhere in supabase-schema.sql. Rather than
 * fabricate one for a single internal page, /insights gates on this
 * plain, explicit allowlist instead. Fails closed: an unset or empty
 * ADMIN_EMAILS means nobody passes, never "anyone does."
 */
export function isAdminEmail(email: string | undefined, adminEmailsEnv: string | undefined): boolean {
  if (!email) return false;
  const allowlist = (adminEmailsEnv ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
