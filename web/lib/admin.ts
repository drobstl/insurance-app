/**
 * Admin access control.
 *
 * Admin emails are configured via the NEXT_PUBLIC_ADMIN_EMAILS environment
 * variable — a comma-separated list of email addresses.
 *
 * Example in .env.local:
 *   NEXT_PUBLIC_ADMIN_EMAILS=support@agentforlife.app,daniel@example.com
 */

const ADMIN_EMAILS: string[] = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS || ''
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Returns true if the given email belongs to an admin user.
 */
export function isAdminEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
