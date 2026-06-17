import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { deriveLeadCode } from './lead-code-derive';

/**
 * Phone-keyed dedup index for lead re-imports.
 *
 * The global `leadCodes/{derived}` index (see lead-dedup.ts) only has a
 * doc for leads that got a phone-DERIVED code. A lead that fell back to a
 * random `L…` code (`codeKind:'fallback'` — no phone at create time, a
 * cross-agent collision on the derived code, or the historical DOB-based
 * code scheme) has NO doc at its phone-derived key. So a re-import that
 * derives the same phone code looks up `leadCodes/{derived}`, misses, and
 * creates a SECOND lead for a phone the agent already has — the
 * duplicate-on-re-import leak (Daniel's account, ~35 dupes Jun 15 2026).
 *
 * This index sidesteps that: it keys each EXISTING lead by the derived
 * code of its own phone (not by its stored `leadCode`), so a fallback-
 * coded lead is still found by phone. `deriveLeadCode` normalizes format
 * differences between the two imports ("1-256-478-7899" and "2564787899"
 * both key to "2564787899"), so a refreshed vendor list matches the
 * originally-imported rows.
 */

export interface ExistingLeadForIndex {
  id: string;
  phone?: string | null;
  /** Structured phone list; first entry is used when `phone` is empty. */
  phones?: Array<{ number?: string | null }> | null;
  leadCode?: string | null;
  name?: string | null;
}

export interface IndexedLead {
  leadId: string;
  leadCode: string;
  name?: string;
}

/** Pull the best phone string off a lead doc (`phone`, else first `phones[]`). */
function leadPhone(lead: ExistingLeadForIndex): string {
  if (lead.phone) return lead.phone;
  const first = lead.phones?.find((p) => p && p.number);
  return first?.number ?? '';
}

/**
 * Build a `derivedCode → lead` map from an agent's existing leads.
 *
 * Leads with no derivable phone (fewer than 10 digits) are skipped — they
 * can't be matched by phone and would collide on a null key. First write
 * wins on a shared phone (e.g. a household landline) so the map is stable
 * regardless of input order.
 */
export function buildLeadPhoneIndex(leads: ExistingLeadForIndex[]): Map<string, IndexedLead> {
  const index = new Map<string, IndexedLead>();
  for (const lead of leads) {
    const derived = deriveLeadCode(leadPhone(lead));
    if (!derived || index.has(derived)) continue;
    index.set(derived, {
      leadId: lead.id,
      leadCode: lead.leadCode ?? '',
      name: lead.name ?? undefined,
    });
  }
  return index;
}

/**
 * Read an agent's leads and build the phone index. One collection read
 * per call — bulk import is rare and not latency-critical. Only the
 * fields needed for matching + the "already imported" banner are pulled.
 */
export async function loadLeadPhoneIndex(
  db: Firestore,
  agentId: string,
): Promise<Map<string, IndexedLead>> {
  const snap = await db
    .collection('agents').doc(agentId)
    .collection('leads')
    .select('phone', 'phones', 'leadCode', 'name')
    .get();
  const leads: ExistingLeadForIndex[] = snap.docs.map((d) => {
    const data = d.data() as Omit<ExistingLeadForIndex, 'id'>;
    return {
      id: d.id,
      phone: data.phone,
      phones: data.phones,
      leadCode: data.leadCode,
      name: data.name,
    };
  });
  return buildLeadPhoneIndex(leads);
}
