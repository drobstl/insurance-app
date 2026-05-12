#!/usr/bin/env npx tsx
/**
 * inspect-recent-ingestion-jobs — READ-ONLY diagnostic.
 *
 * Pulls the N most recent ingestionJobsV3 docs for a given agent and
 * prints their status, error codes, timings, and image counts. Used to
 * diagnose why the dashboard PDF extraction is falling back to direct
 * parser when v3 should be succeeding.
 *
 * Usage:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/inspect-recent-ingestion-jobs.ts <agentId> [limit]
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

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    const c = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof c.toDate === 'function') return c.toDate().getTime();
    const s = typeof c._seconds === 'number' ? c._seconds : c.seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof candidate.toDate === 'function') {
      try { return candidate.toDate().toISOString(); } catch { return null; }
    }
    const secs = typeof candidate._seconds === 'number' ? candidate._seconds : candidate.seconds;
    if (typeof secs === 'number') return new Date(secs * 1000).toISOString();
  }
  return null;
}

async function main() {
  const agentId = process.argv[2];
  const limit = parseInt(process.argv[3] ?? '15', 10);
  if (!agentId) {
    console.error('Usage: inspect-recent-ingestion-jobs.ts <agentId> [limit=15]');
    process.exit(1);
  }

  const db = getAdminFirestore();
  // ingestionJobsV3 is a TOP-LEVEL collection keyed by agentId on the doc.
  // No composite index for (agentId, createdAt) — fetch a recency window
  // by createdAt only and filter client-side.
  const sinceMs = Date.now() - 6 * 60 * 60 * 1000; // last 6h
  const all = await db
    .collection('ingestionJobsV3')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  const docs = all.docs
    .filter((d) => (d.data() as { agentId?: string }).agentId === agentId)
    .filter((d) => {
      const ms = toMillis((d.data() as { createdAt?: unknown }).createdAt);
      return ms === null || ms >= sinceMs;
    })
    .slice(0, limit);
  const snap = { size: docs.length, empty: docs.length === 0, docs };

  console.log(`\nLast ${snap.size} ingestion jobs for agent ${agentId}:\n`);
  if (snap.empty) {
    console.log('(none found)');
    return;
  }

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const createdAt = toIso(d.createdAt);
    const updatedAt = toIso(d.updatedAt);
    const status = d.status ?? '(no status)';
    const errCode = (d.error as Record<string, unknown> | undefined)?.code ?? null;
    const errMsg = (d.error as Record<string, unknown> | undefined)?.message ?? null;
    const carrierType = d.carrierFormType ?? null;
    const imagePaths = Array.isArray(d.gcsImagePaths) ? d.gcsImagePaths.length : 0;
    const sourceFileName = d.sourceFileName ?? null;
    const claudeMs = (d.result as Record<string, unknown> | undefined)?.timings &&
      ((d.result as { timings?: Record<string, unknown> }).timings as Record<string, unknown> | undefined)?.claudeMs;

    console.log(`── ${doc.id}`);
    console.log(`   created:  ${createdAt}`);
    console.log(`   updated:  ${updatedAt}`);
    console.log(`   status:   ${status}`);
    if (errCode) console.log(`   error:    ${errCode} — ${errMsg}`);
    if (sourceFileName) console.log(`   file:     ${sourceFileName}`);
    if (carrierType) console.log(`   carrier:  ${carrierType}`);
    console.log(`   images:   ${imagePaths}`);
    if (claudeMs) console.log(`   claudeMs: ${claudeMs}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error('inspect-recent-ingestion-jobs failed:', err);
  process.exit(1);
});
