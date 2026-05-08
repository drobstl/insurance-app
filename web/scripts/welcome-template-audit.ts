#!/usr/bin/env npx tsx
/**
 * Welcome SMS template audit + migration.
 *
 * Background: agents who customized their welcome template via
 * Settings → Client Welcome Text have that customization frozen on
 * `agents/{id}.welcomeSmsTemplate`. The May 7, 2026 numbered-step
 * default in `web/app/dashboard/clients/page.tsx > DEFAULT_WELCOME_SMS_TEMPLATE`
 * only applies when that field is empty. So agents on stale customs
 * (typically old defaults they accepted as their own years ago) keep
 * sending old copy after the May 12 lift.
 *
 * Two modes:
 *
 *   1. Dry-run audit (default) — lists every agent with a non-empty
 *      `welcomeSmsTemplate` plus the full template text. No writes.
 *
 *   2. Targeted clear (`--clear-if-substring=<text> --apply`) — clears
 *      `welcomeSmsTemplate` on every agent whose template contains the
 *      given substring. Idempotent. Use to migrate agents off a known
 *      old default in one shot. Run iteratively for each known signature:
 *
 *        # Pre-v3.1 short default (Sep 2025 era, cf. commit 9575c8a):
 *        npm run audit:welcome-templates -- \
 *          --clear-if-substring='Download the AgentForLife app and use code' \
 *          --apply
 *
 *        # v3.1 paragraph default ("Mortgage Protection agent..."):
 *        npm run audit:welcome-templates -- \
 *          --clear-if-substring="I'm sending my clients this app" \
 *          --apply
 *
 *        # Older "Welcome to the family" default:
 *        npm run audit:welcome-templates -- \
 *          --clear-if-substring='Welcome to the family' \
 *          --apply
 *
 * After clear, the agent's inline compose surface falls through to
 * the current `DEFAULT_WELCOME_SMS_TEMPLATE` (May 7 numbered-step).
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

interface Args {
  clearIfSubstring: string | null;
  apply: boolean;
}

function parseArgs(): Args {
  const args: Args = { clearIfSubstring: null, apply: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--clear-if-substring=')) {
      args.clearIfSubstring = arg.slice('--clear-if-substring='.length);
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: welcome-template-audit.ts [--clear-if-substring=<text> --apply]\n' +
          '  no flags         Dry-run audit; lists every agent with non-empty welcomeSmsTemplate.\n' +
          '  --clear-if-substring=<text>\n' +
          '                   With --apply, clears the template on agents whose template contains <text>.\n' +
          '  --apply          Required to actually write. Without it, prints what would be cleared.',
      );
      process.exit(0);
    }
  }
  return args;
}

interface AgentRecord {
  agentId: string;
  email: string | null;
  name: string | null;
  template: string;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const db = getAdminFirestore();
  const agentsSnap = await db.collection('agents').get();

  const recordsWithTemplate: AgentRecord[] = [];
  for (const doc of agentsSnap.docs) {
    const data = doc.data();
    const raw = data.welcomeSmsTemplate;
    const template = typeof raw === 'string' ? raw.trim() : '';
    if (!template) continue;
    recordsWithTemplate.push({
      agentId: doc.id,
      email: (data.email as string) || null,
      name: (data.name as string) || null,
      template,
    });
  }

  console.log(`Agents scanned: ${agentsSnap.docs.length}`);
  console.log(`Agents with non-empty welcomeSmsTemplate: ${recordsWithTemplate.length}`);

  if (recordsWithTemplate.length === 0) {
    console.log('\nNothing to migrate. All agents fall through to DEFAULT_WELCOME_SMS_TEMPLATE.');
    return;
  }

  if (!args.clearIfSubstring) {
    // Dry-run audit mode: list every template.
    console.log('\nFull template per agent (dry-run; no writes):');
    for (const r of recordsWithTemplate) {
      const label = `${r.name ?? '<unknown>'} <${r.email ?? '?'}> (${r.agentId})`;
      console.log(`\n--- ${label} ---`);
      console.log(r.template);
    }
    console.log(
      '\nTo migrate a known old default, re-run with `--clear-if-substring="<distinctive substring>" --apply`.',
    );
    return;
  }

  // Targeted clear mode.
  const matches = recordsWithTemplate.filter((r) => r.template.includes(args.clearIfSubstring!));
  console.log(`\nMatching substring (${args.clearIfSubstring.length} chars):`);
  console.log(`  "${args.clearIfSubstring}"`);
  console.log(`Matched agents: ${matches.length}`);

  if (matches.length === 0) {
    console.log('No matches. Nothing to clear.');
    return;
  }

  console.log('\nMatched agents (would be cleared):');
  for (const r of matches) {
    console.log(`  ${r.name ?? '<unknown>'} <${r.email ?? '?'}> (${r.agentId})`);
  }

  if (!args.apply) {
    console.log('\nDry run — no writes. Re-run with `--apply` to clear.');
    return;
  }

  let written = 0;
  for (const r of matches) {
    await db.collection('agents').doc(r.agentId).update({
      welcomeSmsTemplate: FieldValue.delete(),
    });
    written += 1;
    console.log(`  ✓ cleared welcomeSmsTemplate for ${r.email ?? r.agentId}`);
  }
  console.log(`\nCleared ${written} agent(s). Affected agents now fall through to DEFAULT_WELCOME_SMS_TEMPLATE.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
