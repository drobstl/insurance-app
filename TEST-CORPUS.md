# AFL Test Corpus Readiness Sheet

## Status

- Top-carrier counts and GCS references require a live Firestore query against production data.
- This workspace session does not include a direct Firestore data export artifact, so values below are marked `PENDING_QUERY`.
- American-Amicable is explicitly included as required.

## Firestore Query to Determine Top Carriers by Upload Volume

Use this query flow against `ingestionJobsV3`:

1. Pull recent successful application jobs (`status in ["review_ready","saved"]`, `mode == "application"`).
2. Read `result.application.data.insuranceCompany` (fallback: normalized filename heuristics if missing).
3. Group by normalized carrier and count.
4. For top 5 carriers, collect 5-10 representative files and include scanned/noisy examples.

Suggested Node/Admin script (run manually with production credentials):

```ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({
  // supply service account here or via env
});

const db = getFirestore();

async function run() {
  const snap = await db.collection("ingestionJobsV3")
    .where("mode", "==", "application")
    .where("status", "in", ["review_ready", "saved"])
    .limit(5000)
    .get();

  const counts = new Map<string, number>();
  const samples = new Map<string, Array<{ id: string; gcsPath?: string; pages?: number }>>();

  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const carrierRaw = d?.result?.application?.data?.insuranceCompany || "UNKNOWN_CARRIER";
    const carrier = String(carrierRaw).trim().toUpperCase() || "UNKNOWN_CARRIER";
    counts.set(carrier, (counts.get(carrier) || 0) + 1);
    if (!samples.has(carrier)) samples.set(carrier, []);
    const arr = samples.get(carrier)!;
    if (arr.length < 10) arr.push({ id: doc.id, gcsPath: d?.gcsPath, pages: d?.result?.application?.pageCount });
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(top);
  for (const [carrier] of top) {
    console.log(carrier, samples.get(carrier));
  }
}

run().catch(console.error);
```

## Corpus Readiness Table

| Carrier Name | Approximate Upload Count | GCS File References (list 5-10 paths or document IDs) | Page Count Range | Quality Tags (clean digital / scanned / mixed / noisy) | Notes |
|---|---:|---|---|---|---|
| American-Amicable (AMAM) | `PENDING_QUERY` | `PENDING_QUERY_DOC_IDS_OR_GCS_PATHS (5-10 required)` | `PENDING_QUERY` | `clean digital`, `mixed`, `noisy` | Known layout variation; include Audrey Allman sample equivalent and at least one scanned AMAM file. |
| Carrier 2 (`PENDING_QUERY`) | `PENDING_QUERY` | `PENDING_QUERY_DOC_IDS_OR_GCS_PATHS (5-10 required)` | `PENDING_QUERY` | `clean digital`, `mixed` | Fill from top-volume output. |
| Carrier 3 (`PENDING_QUERY`) | `PENDING_QUERY` | `PENDING_QUERY_DOC_IDS_OR_GCS_PATHS (5-10 required)` | `PENDING_QUERY` | `clean digital`, `scanned` | Ensure at least one scanned/noisy file in this row or Carrier 4/5 rows. |
| Carrier 4 (`PENDING_QUERY`) | `PENDING_QUERY` | `PENDING_QUERY_DOC_IDS_OR_GCS_PATHS (5-10 required)` | `PENDING_QUERY` | `clean digital`, `noisy` | Include one low-quality OCR-challenging sample. |
| Carrier 5 (`PENDING_QUERY`) | `PENDING_QUERY` | `PENDING_QUERY_DOC_IDS_OR_GCS_PATHS (5-10 required)` | `PENDING_QUERY` | `clean digital`, `mixed` | Optional if top-5 extraction scope is reduced; keep minimum 3 carriers at 5+ files each. |

## Minimum Corpus Gate (Must Be True Before Phase 2 Validation)

- At least 3 carriers populated (target 5).
- At least 5 files per included carrier (target 10 for AMAM + top 2).
- At least 2-3 scanned/noisy files across corpus.
- AMAM must be present.
