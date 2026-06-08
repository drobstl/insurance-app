#!/usr/bin/env npx tsx
/**
 * Clear a user's enrolled second factors (SMS MFA).
 *
 * Operator-trusted recovery + testing tool. Firebase phone MFA has no
 * self-service backup codes, and AFL's mandatory model removes the user-facing
 * "turn off" control, so admin reset is THE recovery path for a locked-out
 * agent (lost/changed phone) — and the way to re-test enrollment on the
 * preview. Mirrors POST /api/admin/reset-mfa, but runs locally with the admin
 * service account so no ID token juggling is needed.
 *
 * Default: DRY RUN — looks the user up, prints uid/email/enrolled factors, and
 * writes nothing. Pass `--apply` to actually clear the factors.
 *
 * Required (one of):
 *   --email=<email>   Look the user up by email.
 *   --uid=<uid>       Look the user up by uid.
 *
 * Run (from web/, in a checkout whose .env.local has the admin creds):
 *   npm run reset-mfa -- --email=you@example.com           # dry run (reads only)
 *   npm run reset-mfa -- --email=you@example.com --apply   # actually clear factors
 *
 * (Imports lib/firebase-admin, which pulls in `server-only`, so it must run via
 * the npm script above — that wires the server-only-shim. A bare `tsx` will throw.)
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminAuth } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

function getArg(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length).trim() : null;
}

async function main() {
  const email = getArg('email');
  const uid = getArg('uid');
  const apply = process.argv.slice(2).includes('--apply');

  if (!email && !uid) {
    console.error('Provide --email=<email> or --uid=<uid>. (Add --apply to write; default is a dry run.)');
    process.exit(1);
  }

  const auth = getAdminAuth();
  const user = email ? await auth.getUserByEmail(email.toLowerCase()) : await auth.getUser(uid!);
  const factors = user.multiFactor?.enrolledFactors ?? [];

  console.log(`User:     ${user.email ?? '(no email)'}  (${user.uid})`);
  console.log(`Factors:  ${factors.length === 0 ? 'none enrolled' : factors.map((f) => f.displayName ?? f.factorId).join(', ')}`);

  if (factors.length === 0) {
    console.log('Nothing to clear.');
    return;
  }

  if (!apply) {
    console.log('\nDRY RUN — re-run with --apply to clear the factor(s) above.');
    return;
  }

  await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
  console.log('\n✓ Cleared. The user can sign in and will be prompted to re-enroll.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
