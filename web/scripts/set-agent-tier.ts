#!/usr/bin/env npx tsx
/**
 * Set an agent's membershipTier by name.
 *
 * Operator-trusted, one-off admin tool. Looks up agent docs whose `name`
 * matches (case-insensitive, trimmed) one of the supplied names and sets
 * their `membershipTier`. Use to manually grant Pro/Agency to specific
 * agents (e.g. comped accounts) before Pro is purchasable via checkout.
 *
 * Default: DRY RUN — prints every matched agent (uid, name, email,
 * current tier → target tier) and writes nothing. Pass `--apply` to
 * actually write.
 *
 * Required:
 *   --names="A,B"     Comma-separated agent names (case-insensitive exact
 *                     match on the agent doc's `name` field).
 *   --tier=<tier>     Target tier: starter|growth|pro|agency|founding.
 *
 * Run:
 *   npx tsx scripts/set-agent-tier.ts --names="Graham Rich,Kevin Waldher" --tier=pro
 *   npx tsx scripts/set-agent-tier.ts --names="Graham Rich,Kevin Waldher" --tier=pro --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const VALID_TIERS = ['starter', 'growth', 'pro', 'agency', 'founding'];

interface Args {
  names: string[];
  tier: string;
  apply: boolean;
}

function parseArgs(): Args {
  const args: Args = { names: [], tier: '', apply: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--names=')) {
      args.names = arg
        .slice('--names='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--tier=')) {
      args.tier = arg.slice('--tier='.length).trim().toLowerCase();
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: set-agent-tier.ts --names="A,B" --tier=pro [--apply]');
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const { names, tier, apply } = parseArgs();
  if (names.length === 0 || !tier) {
    console.error('ERROR: --names and --tier are both required. Use --help.');
    process.exit(1);
  }
  if (!VALID_TIERS.includes(tier)) {
    console.error(`ERROR: --tier must be one of: ${VALID_TIERS.join(', ')}`);
    process.exit(1);
  }

  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const db = getAdminFirestore();
  const snap = await db.collection('agents').get();

  const matches: Array<{ uid: string; name: string; email: string; tier: string }> = [];
  for (const doc of snap.docs) {
    const d = doc.data() as { name?: string; email?: string; membershipTier?: string };
    const name = (d.name || '').trim();
    if (name && wanted.has(name.toLowerCase())) {
      matches.push({
        uid: doc.id,
        name,
        email: d.email || '(no email)',
        tier: d.membershipTier || '(unset)',
      });
    }
  }

  console.log(`\nTarget tier: ${tier}`);
  console.log(`Scanned ${snap.size} agents. Matched ${matches.length} of ${names.length} name(s):\n`);
  for (const m of matches) {
    console.log(`  • ${m.name}  <${m.email}>  uid=${m.uid}  tier: ${m.tier} → ${tier}`);
  }

  const matchedNames = new Set(matches.map((m) => m.name.toLowerCase()));
  const missing = names.filter((n) => !matchedNames.has(n.toLowerCase()));
  if (missing.length > 0) {
    console.log(`\n  ⚠ No agent matched: ${missing.join(', ')}`);
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to set the tier.\n');
    return;
  }

  console.log('\nApplying…');
  for (const m of matches) {
    await db.collection('agents').doc(m.uid).set({ membershipTier: tier }, { merge: true });
    console.log(`  ✓ ${m.name} → ${tier}`);
  }
  console.log(`\nDone. Updated ${matches.length} agent(s).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
