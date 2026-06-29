#!/usr/bin/env npx tsx
/**
 * Clear a client's reset-reveal cadence stamps so the in-app reveal shows again
 * on their next app open.
 *
 * The reveal is a repeated nudge with a cooldown, so once a client has seen it
 * recently it won't re-show until the clock runs out. This resets the clock for
 * ONE client — handy for testing the reveal + the matched door on a device.
 *
 * Default: DRY RUN — looks the client up, prints the current stamps, writes
 * nothing. Pass `--apply` to actually clear them.
 *
 * Run (from web/, in a checkout whose .env.local has the admin creds):
 *   npm run reset-reveal-clock -- --code=KN52AJ           # dry run (reads only)
 *   npm run reset-reveal-clock -- --code=KN52AJ --apply   # clear the stamps
 *
 * (Imports lib/resolve-client-by-code, which pulls in `server-only`, so it must
 * run via the npm script above — that wires the server-only-shim.)
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveClientByAnyCode } from '../lib/resolve-client-by-code';
import {
  RESET_REVEAL_SHOWN_AT,
  RESET_REVEAL_DISMISSED_AT,
  RESET_REVEAL_ENGAGED_AT,
} from '../lib/reset-reveal';

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
  const code = getArg('code') || 'KN52AJ';
  const apply = process.argv.slice(2).includes('--apply');

  const match = await resolveClientByAnyCode(code);
  if (!match) {
    console.error(`No client resolves from code "${code}".`);
    process.exit(1);
  }

  const snap = await match.clientRef.get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const stamps = {
    [RESET_REVEAL_SHOWN_AT]: data[RESET_REVEAL_SHOWN_AT] ?? null,
    [RESET_REVEAL_DISMISSED_AT]: data[RESET_REVEAL_DISMISSED_AT] ?? null,
    [RESET_REVEAL_ENGAGED_AT]: data[RESET_REVEAL_ENGAGED_AT] ?? null,
  };
  console.log(`Client "${(data.name as string) || code}" (agent ${match.agentId})`);
  console.log('  current cadence stamps:', stamps);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to clear these stamps.');
    return;
  }

  await match.clientRef.update({
    [RESET_REVEAL_SHOWN_AT]: FieldValue.delete(),
    [RESET_REVEAL_DISMISSED_AT]: FieldValue.delete(),
    [RESET_REVEAL_ENGAGED_AT]: FieldValue.delete(),
  });
  console.log("\nCleared. The reveal will show again on this client's next app open.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
