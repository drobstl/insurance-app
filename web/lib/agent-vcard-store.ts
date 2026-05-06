import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { getAdminFirestore } from './firebase-admin';
import { getLinqPhoneNumber, uploadAttachment } from './linq';
import { buildAgentVCard, type AgentVCardOutput } from './vcard';

/**
 * Server-side store for per-agent vCards.
 *
 * SOURCE OF TRUTH: `docs/AFL_Messaging_Operating_Model_v3.1.md` §9.7 +
 * `CONTEXT.md > Channel Rules > vCard generation`.
 *
 * Caching contract (cached on the agent doc):
 * - `vcardSourceFingerprint` — sha256 over the inputs that go into the
 *   .vcf body (name, agency, line phone, email, note, photo bytes).
 *   Recompute on every call; if it matches the stored value, the cache
 *   is hot and we re-use the existing Linq attachment id.
 * - `vcardLinqAttachmentId` — the permanent Linq attachment id. Used in
 *   the welcome activation reply MMS in Commit 4.
 * - `vcardSizeBytes` / `vcardPhotoEmbedded` / `vcardGeneratedAt` —
 *   telemetry / debugging fields.
 *
 * Regeneration triggers:
 * - Agent edits name or agency in settings.
 * - Agent uploads a new profile photo (settings page already produces a
 *   400x400 JPEG at 0.85 quality; we trust that and only embed if the
 *   resulting payload is under 60 KB — see `web/lib/vcard.ts`).
 * - The Linq line number env var changes (rare; bumps the fingerprint
 *   automatically).
 *
 * The route at /api/agent/vcard/regenerate calls
 * {@link ensureAgentVCardAttachment} after a settings save. The Linq
 * webhook (Commit 4) calls the same function lazily on the welcome
 * activation reply path so a never-logged-in agent's first activation
 * still gets a vCard.
 */

interface EnsureVCardOptions {
  /** Force regeneration even if the source fingerprint matches. */
  force?: boolean;
}

export interface EnsureVCardResult {
  attachmentId: string | null;
  outcome: 'cache_hit' | 'regenerated' | 'force_regenerated' | 'no_agent' | 'no_minimum_data';
  vcard?: Pick<AgentVCardOutput, 'vcardSizeBytes' | 'photoEmbedded' | 'inputPhotoBytes' | 'sourceFingerprint'>;
}

interface AgentDocData {
  name?: unknown;
  agencyName?: unknown;
  email?: unknown;
  photoBase64?: unknown;
  vcardSourceFingerprint?: unknown;
  vcardLinqAttachmentId?: unknown;
}

function readString(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

/**
 * Ensure the agent has a current vCard attachment uploaded to Linq.
 * Returns the cached attachment id if the source fingerprint matches,
 * otherwise rebuilds the vCard, uploads the new bytes to Linq, and
 * persists the new id + fingerprint atomically on the agent doc.
 *
 * Returns `attachmentId: null` and `outcome: 'no_minimum_data'` if the
 * agent has no name yet — we don't ship an empty vCard. Caller must
 * gracefully degrade to sending the first response without an
 * attachment in that case.
 */
export async function ensureAgentVCardAttachment(
  agentId: string,
  opts: EnsureVCardOptions = {},
): Promise<EnsureVCardResult> {
  const db = getAdminFirestore();
  const agentRef = db.collection('agents').doc(agentId);
  const snap = await agentRef.get();
  if (!snap.exists) {
    return { attachmentId: null, outcome: 'no_agent' };
  }
  const data = (snap.data() ?? {}) as AgentDocData;
  const agentName = readString(data.name).trim();
  if (!agentName) {
    return { attachmentId: null, outcome: 'no_minimum_data' };
  }

  let linqLinePhone: string;
  try {
    linqLinePhone = getLinqPhoneNumber();
  } catch (err) {
    console.error('[agent-vcard] LINQ_PHONE_NUMBER missing — cannot generate vCard', {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { attachmentId: null, outcome: 'no_minimum_data' };
  }

  const built = buildAgentVCard({
    agentId,
    agentName,
    agencyName: readString(data.agencyName).trim() || null,
    linqLinePhone,
    agentEmail: readString(data.email).trim() || null,
    photoBase64: readString(data.photoBase64) || null,
  });

  const cachedFingerprint = readString(data.vcardSourceFingerprint);
  const cachedAttachmentId = readString(data.vcardLinqAttachmentId);

  if (
    !opts.force &&
    cachedFingerprint &&
    cachedAttachmentId &&
    cachedFingerprint === built.sourceFingerprint
  ) {
    return {
      attachmentId: cachedAttachmentId,
      outcome: 'cache_hit',
      vcard: {
        vcardSizeBytes: built.vcardSizeBytes,
        photoEmbedded: built.photoEmbedded,
        inputPhotoBytes: built.inputPhotoBytes,
        sourceFingerprint: built.sourceFingerprint,
      },
    };
  }

  let attachmentId: string;
  try {
    attachmentId = await uploadAttachment({
      filename: `${agentId}_agent_card.vcf`,
      contentType: 'text/vcard',
      sizeBytes: built.vcardSizeBytes,
      fileBuffer: built.vcardBuffer,
    });
  } catch (err) {
    console.error('[agent-vcard] Linq upload failed', {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await agentRef.update({
    vcardLinqAttachmentId: attachmentId,
    vcardSourceFingerprint: built.sourceFingerprint,
    vcardSizeBytes: built.vcardSizeBytes,
    vcardPhotoEmbedded: built.photoEmbedded,
    vcardInputPhotoBytes: built.inputPhotoBytes,
    vcardGeneratedAt: FieldValue.serverTimestamp(),
  });

  if (built.inputPhotoBytes !== null && !built.photoEmbedded) {
    console.warn('[agent-vcard] photo dropped from vCard (over 60KB)', {
      agentId,
      inputPhotoBytes: built.inputPhotoBytes,
    });
  }

  console.log('[agent-vcard] generated', {
    agentId,
    sizeBytes: built.vcardSizeBytes,
    photoEmbedded: built.photoEmbedded,
    forced: !!opts.force,
    attachmentIdSuffix: attachmentId.length > 6 ? `***${attachmentId.slice(-6)}` : '***',
  });

  return {
    attachmentId,
    outcome: opts.force ? 'force_regenerated' : 'regenerated',
    vcard: {
      vcardSizeBytes: built.vcardSizeBytes,
      photoEmbedded: built.photoEmbedded,
      inputPhotoBytes: built.inputPhotoBytes,
      sourceFingerprint: built.sourceFingerprint,
    },
  };
}
