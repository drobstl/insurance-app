import 'server-only';

import { getAdminFirestore } from './firebase-admin';

/**
 * Lead code generator. Mirrors the client-code alphabet from
 * web/app/dashboard/clients/page.tsx::generateClientCode (no I/O/0/1 to avoid
 * confusion when an agent reads the code over the phone), but prefixes with
 * `L` so the lookup endpoint can distinguish lead codes from client and
 * beneficiary codes (which start with `B`) at a glance.
 *
 * Format: L + 7 chars from the unambiguous alphabet → 8 chars total.
 *
 * Collision handling: caller passes `existing` for in-process dedupe (e.g.
 * during a batch import); for the global guarantee the consumer should write
 * the code to the `leadCodes` index using `set({…}, { merge: false })` and
 * retry on AlreadyExists. For the Phase 1 manual-create path the collision
 * probability is ~1 in 32^7 (~3.4 billion) which is fine without retry.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLeadCode(): string {
  let code = 'L';
  for (let i = 0; i < 7; i++) {
    code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return code;
}

/**
 * Generate a lead code that is verified absent from the `leadCodes` index.
 * Retries up to 5 times before giving up — at the alphabet's collision rate
 * this should never trigger in practice, but the loop bounds the worst case.
 */
export async function generateUniqueLeadCode(): Promise<string> {
  const db = getAdminFirestore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLeadCode();
    const existing = await db.collection('leadCodes').doc(code).get();
    if (!existing.exists) return code;
  }
  throw new Error('Failed to generate a unique lead code after 5 attempts');
}
