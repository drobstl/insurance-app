import 'server-only';

import { getAdminFirestore } from './firebase-admin';

const FALLBACK_APP_URL = 'https://agentforlife.app';
const MAX_SLUG_LEN = 40;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, MAX_SLUG_LEN);
}

function isValidSlug(slug: string | null | undefined): slug is string {
  return !!slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function buildCandidates(agentName: string, agencyName: string | null): string[] {
  const parts = agentName.trim().split(/\s+/).filter(Boolean);
  const firstName = slugify(parts[0] || 'agent');
  const lastInitial = parts.length > 1 ? slugify(parts[parts.length - 1][0] || '') : '';
  const agencySlug = slugify(agencyName || '');

  const candidates = [
    firstName,
    lastInitial ? `${firstName}-${lastInitial}` : '',
    agencySlug,
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export async function ensureAgentBookingSlug(params: {
  agentId: string;
  agentName: string;
  agencyName?: string | null;
  existingSlug?: string | null;
}): Promise<string> {
  const db = getAdminFirestore();

  if (isValidSlug(params.existingSlug)) {
    return params.existingSlug;
  }

  const agentRef = db.collection('agents').doc(params.agentId);
  const fallbackBase = slugify(params.agentName.split(/\s+/)[0] || 'agent') || 'agent';

  const resolvedSlug = await db.runTransaction(async (tx) => {
    const snap = await tx.get(agentRef);
    const data = (snap.data() || {}) as Record<string, unknown>;
    const currentSlug = data.bookingSlug as string | undefined;
    if (isValidSlug(currentSlug)) {
      return currentSlug;
    }

    const nameFromDoc = (data.name as string) || params.agentName;
    const agencyFromDoc = (data.agencyName as string) || params.agencyName || null;
    const candidates = buildCandidates(nameFromDoc, agencyFromDoc);

    const isAvailable = async (slug: string) => {
      const q = db.collection('agents').where('bookingSlug', '==', slug).limit(1);
      const qSnap = await tx.get(q);
      if (qSnap.empty) return true;
      return qSnap.docs[0].id === params.agentId;
    };

    for (const candidate of candidates) {
      if (await isAvailable(candidate)) {
        tx.update(agentRef, { bookingSlug: candidate });
        return candidate;
      }
    }

    let suffix = 2;
    while (suffix <= 999) {
      const candidate = `${fallbackBase}-${suffix}`;
      if (await isAvailable(candidate)) {
        tx.update(agentRef, { bookingSlug: candidate });
        return candidate;
      }
      suffix++;
    }

    const epochFallback = `${fallbackBase}-${Date.now().toString().slice(-6)}`;
    tx.update(agentRef, { bookingSlug: epochFallback });
    return epochFallback;
  });

  return resolvedSlug;
}

export function buildBrandedBookingUrl(params: {
  bookingSlug: string;
  source: 'conservation';
  stage: string;
}): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || FALLBACK_APP_URL).replace(/\/+$/, '');
  const url = new URL(`/book/${params.bookingSlug}`, appUrl);
  url.searchParams.set('source', params.source);
  url.searchParams.set('stage', params.stage);
  return url.toString();
}
