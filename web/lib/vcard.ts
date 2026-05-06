import 'server-only';

import { createHash } from 'crypto';

/**
 * Per-agent vCard generation.
 *
 * SOURCE OF TRUTH: `docs/AFL_Messaging_Operating_Model_v3.1.md` §9.7 +
 * `CONTEXT.md > Channel Rules > vCard generation`.
 *
 * vCards ride on the Linq line's first response after the client taps
 * Activate (the `sms:` URL scheme cannot attach files). The `.vcf` is
 * sent as an MMS attachment so the client can save the Linq line as a
 * properly-named contact ("Daniel Roberts — Office") with the agent's
 * photo, so subsequent messages from the line arrive labeled correctly.
 *
 * Carrier MMS payload constraints:
 * - Total MMS payload should stay safely under 100 KB to avoid
 *   carrier-side rejection or downgrade.
 * - With a 60 KB compressed photo, the resulting vCard plus a brief
 *   text body fits comfortably.
 * - If the agent's stored `photoBase64` is too large for the budget,
 *   we emit the vCard WITHOUT the embedded PHOTO and log a warning.
 *   The vCard still works (saves agent name + agency + Linq number);
 *   the photo just won't appear on the contact card. A follow-up that
 *   adds server-side `sharp` for re-compression is cheap if telemetry
 *   shows this happening regularly.
 */

/** Per spec — keep MMS-embedded photo under this size. */
export const VCARD_PHOTO_MAX_BYTES = 60 * 1024;

/** Defensive cap on total .vcf size so we never ship a >100KB MMS. */
export const VCARD_TOTAL_MAX_BYTES = 90 * 1024;

export interface AgentVCardInput {
  agentId: string;
  agentName: string;
  agencyName?: string | null;
  /** The Linq line phone number in any format; will be E.164-normalized in the vCard. */
  linqLinePhone: string;
  /** Optional contact email rendered as the vCard EMAIL field. */
  agentEmail?: string | null;
  /** Optional NOTE text — defaults to a neutral office-line description. */
  noteText?: string | null;
  /** Pre-cropped 400x400 JPEG, base64-encoded, no data URL prefix. May be omitted. */
  photoBase64?: string | null;
}

export interface AgentVCardOutput {
  vcardString: string;
  vcardBuffer: Buffer;
  vcardSizeBytes: number;
  /** True iff a PHOTO field was embedded (the input photo was within budget). */
  photoEmbedded: boolean;
  /** Original input photo size in bytes when present (for telemetry / dropped-photo logs). */
  inputPhotoBytes: number | null;
  /**
   * Stable fingerprint over the inputs that go INTO the .vcf body. The
   * agent doc caches this so we only re-upload to Linq when the agent's
   * name OR photo OR linq line OR agency changed.
   */
  sourceFingerprint: string;
}

function escapeVCardField(raw: string): string {
  // Per RFC 6350 §3.4: `\` `,` `;` and newlines must be escaped in TEXT values.
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function splitNameForN(fullName: string): { family: string; given: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { family: '', given: '' };
  if (parts.length === 1) return { family: '', given: parts[0] };
  const given = parts[0];
  const family = parts.slice(1).join(' ');
  return { family, given };
}

function normalizePhoneForVCard(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+1') && digits.length === 12) return digits;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits;
}

function fingerprint(input: AgentVCardInput, photoEmbedded: boolean): string {
  const h = createHash('sha256');
  h.update('vcard-v1');
  h.update('|name|');
  h.update(input.agentName || '');
  h.update('|agency|');
  h.update(input.agencyName || '');
  h.update('|line|');
  h.update(normalizePhoneForVCard(input.linqLinePhone || ''));
  h.update('|email|');
  h.update(input.agentEmail || '');
  h.update('|note|');
  h.update(input.noteText || '');
  h.update('|photoEmbedded|');
  h.update(photoEmbedded ? '1' : '0');
  if (photoEmbedded && input.photoBase64) {
    // Hash the photo bytes themselves — same photo across two save
    // events should not force a regenerate.
    const photoHash = createHash('sha256').update(input.photoBase64).digest('hex');
    h.update('|photo|');
    h.update(photoHash);
  }
  return h.digest('hex');
}

/**
 * Build a vCard 3.0 string for the given agent. Returns the .vcf bytes
 * plus a fingerprint suitable for cache invalidation.
 *
 * Why vCard 3.0 (not 4.0): iOS Messages saves vCard 3.0 attachments
 * cleanly with embedded JPEG photos. vCard 4.0's PHOTO field uses URI
 * data values (`data:image/jpeg;base64,...`) which iOS accepts but
 * older Android messengers handle inconsistently. 3.0 is the safer
 * lowest-common-denominator for SMS/MMS contact attachments.
 */
export function buildAgentVCard(input: AgentVCardInput): AgentVCardOutput {
  const fullName = (input.agentName || '').trim();
  const escFn = escapeVCardField(fullName || 'AgentForLife');
  const { family, given } = splitNameForN(fullName);
  const escFamily = escapeVCardField(family);
  const escGiven = escapeVCardField(given);
  const phoneE164 = normalizePhoneForVCard(input.linqLinePhone || '');
  const escPhone = escapeVCardField(phoneE164);
  const escAgency = escapeVCardField((input.agencyName || '').trim());
  const escEmail = escapeVCardField((input.agentEmail || '').trim());
  const noteRaw = (input.noteText || '').trim()
    || `${fullName ? `${fullName}'s` : 'AgentForLife'} office line for policy reminders, annual reviews, and account questions.`;
  const escNote = escapeVCardField(noteRaw);

  const inputPhotoBytes = input.photoBase64
    ? Buffer.byteLength(input.photoBase64, 'base64')
    : null;
  const photoEmbedded = !!input.photoBase64 && (inputPhotoBytes ?? 0) <= VCARD_PHOTO_MAX_BYTES;

  // vCard 3.0 PHOTO line per RFC 2426 §3.1.4. Long lines folded at 75
  // octets per §2.6 — newer parsers tolerate unfolded but older Android
  // SMS parsers truncate without folding. We fold the base64 photo
  // payload only.
  const fold = (s: string, width = 75): string => {
    if (s.length <= width) return s;
    const out: string[] = [];
    let i = 0;
    while (i < s.length) {
      out.push(s.slice(i, i + width));
      i += width;
    }
    return out.join('\r\n ');
  };

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escFamily};${escGiven};;;`,
    `FN:${escFn}`,
  ];
  if (escAgency) lines.push(`ORG:${escAgency}`);
  lines.push(`TEL;TYPE=WORK,VOICE:${escPhone}`);
  if (escEmail) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escEmail}`);
  lines.push(`NOTE:${escNote}`);
  if (photoEmbedded && input.photoBase64) {
    lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${fold(input.photoBase64)}`);
  }
  lines.push('END:VCARD', '');

  const vcardString = lines.join('\r\n');
  const vcardBuffer = Buffer.from(vcardString, 'utf8');

  if (vcardBuffer.length > VCARD_TOTAL_MAX_BYTES && photoEmbedded) {
    // Photo pushed total over the carrier-safe envelope (extremely
    // unusual at 60KB cap, but defend against it). Re-emit without
    // photo and recurse once.
    return buildAgentVCard({ ...input, photoBase64: null });
  }

  return {
    vcardString,
    vcardBuffer,
    vcardSizeBytes: vcardBuffer.length,
    photoEmbedded,
    inputPhotoBytes,
    sourceFingerprint: fingerprint(input, photoEmbedded),
  };
}
