import 'server-only';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { normalizePhone, isValidE164 } from './phone';

/**
 * Client duplicate matcher.
 *
 * Two public entry points:
 *   • findExistingClient — single-candidate lookup, called from
 *     PDF parse / manual add / CSV import / lead-convert paths
 *     before creating a new client doc.
 *   • findDuplicateCandidates — whole-account scan, called from the
 *     "Find duplicates" review screen on the Clients dashboard.
 *
 * Matching philosophy (decided with Daniel May 25, 2026):
 *   • Name + DOB is the gold key.
 *   • Name + phone or name + email are strong fallbacks.
 *   • Name alone is acceptable as a *weak* signal — surfaced to the
 *     agent for review but defaulted to "create new" so common-name
 *     collisions don't auto-merge.
 *   • Fuzzy matching (Jaro-Winkler ≥ 0.85, nickname table) only
 *     produces a high-confidence bucket when corroborated by DOB,
 *     phone, or email. Fuzzy name alone defaults to "create new".
 *
 * Confidence buckets (worst → best):
 *   weak               → fuzzy name + corroborator, OR name-only-fuzzy
 *   fuzzy-name-only    → name fuzzy-match, no other identifier
 *   fuzzy-corroborated → name fuzzy-match + DOB/phone/email
 *   strong             → name exact, no DOB but phone or email match
 *   exact              → name exact + DOB match (or all identifiers)
 *
 * Performance: scans use blocking (group clients by last-name initial,
 * phone, email, DOB) so we never do full O(N²) comparison. A 1000-client
 * book typically does ~30–50k pairwise checks instead of 500k.
 */

// ───────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────

export type MatchBucket =
  | 'exact'
  | 'strong'
  | 'fuzzy-corroborated'
  | 'fuzzy-name-only'
  | 'weak';

export interface ClientCandidate {
  id: string;
  name: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Pairs the agent has already marked "not a duplicate". */
  notDuplicateOf?: string[];
  createdAt?: Timestamp | Date | null;
  /** Filled in by findDuplicateCandidates for canonical-pick heuristic. */
  policyCount?: number;
}

export interface DuplicateMatch {
  bucket: MatchBucket;
  /** 0..1 composite score for ranking matches within a bucket. */
  confidence: number;
  /** Human-readable reason, e.g. "name + DOB exact" or "name fuzzy + phone match". */
  reason: string;
}

export interface DuplicateGroup {
  members: ClientCandidate[];
  suggestedCanonicalId: string;
  /** Worst (lowest-confidence) bucket across edges in the group. */
  bucket: MatchBucket;
  /** Pairwise evidence for the group. */
  matches: Array<{ aId: string; bId: string; match: DuplicateMatch }>;
}

// ───────────────────────────────────────────────────────────────
// Name normalization
// ───────────────────────────────────────────────────────────────

const NAME_SUFFIXES = new Set([
  'jr', 'sr', 'ii', 'iii', 'iv', 'v', 'esq', 'phd', 'md', 'dds',
]);

/**
 * Common nickname → canonical-first-name map. Bidirectional: at lookup
 * time we canonicalize both sides through this table before comparing.
 * Intentionally not exhaustive — covers the high-traffic cases that no
 * fuzzy algorithm will catch (Bob/Robert, Bill/William, etc.). Extend
 * cautiously: false-positive merges are worse than false-negative ones.
 */
const NICKNAMES: Record<string, string> = {
  // Robert family
  bob: 'robert', bobby: 'robert', rob: 'robert', robby: 'robert',
  // William family
  bill: 'william', billy: 'william', will: 'william', willie: 'william',
  // James family
  jim: 'james', jimmy: 'james', jamie: 'james',
  // Michael family
  mike: 'michael', mick: 'michael', mickey: 'michael',
  // Elizabeth family
  liz: 'elizabeth', beth: 'elizabeth', lizzy: 'elizabeth',
  betsy: 'elizabeth', betty: 'elizabeth', eliza: 'elizabeth',
  // Katherine / Catherine family
  kate: 'katherine', kathy: 'katherine', katie: 'katherine', kat: 'katherine',
  cathy: 'catherine', cat: 'catherine',
  // Richard family
  dick: 'richard', rick: 'richard', rich: 'richard', ricky: 'richard',
  // David family
  dave: 'david', davy: 'david',
  // Thomas family
  tom: 'thomas', tommy: 'thomas',
  // Theodore family
  ted: 'theodore', teddy: 'theodore',
  // Anthony family
  tony: 'anthony', ant: 'anthony',
  // Joseph family
  joe: 'joseph', joey: 'joseph',
  // Peter family
  pete: 'peter',
  // Samuel family
  sam: 'samuel', sammy: 'samuel',
  // Alexander family
  alex: 'alexander', xander: 'alexander',
  // Patrick / Patricia
  pat: 'patrick', patty: 'patricia', trish: 'patricia', tricia: 'patricia',
  // Margaret family
  meg: 'margaret', maggie: 'margaret', peggy: 'margaret', greta: 'margaret',
  // Susan family
  sue: 'susan', susie: 'susan', suzy: 'susan',
  // Jennifer family
  jen: 'jennifer', jenny: 'jennifer', jenn: 'jennifer',
  // Jessica family
  jess: 'jessica', jessie: 'jessica',
  // Christopher family
  chris: 'christopher', christie: 'christopher',
  // Charles family
  chuck: 'charles', charlie: 'charles', chip: 'charles',
  // Edward family
  ed: 'edward', eddie: 'edward', ned: 'edward',
  // Henry family
  hank: 'henry', harry: 'henry',
  // Frederick family
  fred: 'frederick', freddy: 'frederick', freddie: 'frederick',
  // Benjamin family
  ben: 'benjamin', benji: 'benjamin', benny: 'benjamin',
  // Matthew family
  matt: 'matthew', matty: 'matthew',
  // Nathaniel / Nathan family
  nate: 'nathaniel', nat: 'nathaniel',
  // Nicholas family
  nick: 'nicholas', nicky: 'nicholas',
  // Zachary family
  zach: 'zachary', zack: 'zachary',
  // Abigail / Deborah / Cynthia
  abby: 'abigail', deb: 'deborah', debbie: 'deborah', cindy: 'cynthia',
  // Stephen family
  steve: 'stephen', stevie: 'stephen',
  // Daniel family
  dan: 'daniel', danny: 'daniel',
  // Andrew family
  andy: 'andrew', drew: 'andrew',
  // John family (special — "Jack" is historically John)
  jack: 'john', johnny: 'john',
  // Joshua family
  josh: 'joshua',
  // Eugene family
  gene: 'eugene',
};

function canonicalizeFirstName(first: string): string {
  const lower = first.toLowerCase();
  return NICKNAMES[lower] ?? lower;
}

export interface NormalizedName {
  /** Canonical first name (after nickname expansion + lowercase). */
  first: string;
  /** Canonical last name (lowercased, suffixes stripped). */
  last: string;
  /** "first last" suitable for blocking / exact comparison. */
  full: string;
  /** Whether the input was non-empty and produced at least one token. */
  ok: boolean;
}

/**
 * Normalize a raw name string into a structured form for comparison.
 *
 * Handles three input shapes the codebase already emits or accepts:
 *   • "First [Middle] Last [Suffix]"   ← manual entry, most CSVs
 *   • "Last, First [Middle] [Suffix]"  ← PDF carrier-application convention
 *   • "Last,First"                     ← occasional bad CSV
 *
 * After parsing, applies:
 *   • lowercase
 *   • strip punctuation
 *   • strip name suffixes (Jr, Sr, II, III, etc.) so "John Smith Jr"
 *     and "John Smith" compare as the same person
 *   • nickname canonicalization on the first name
 */
export function normalizeName(raw: string | null | undefined): NormalizedName {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { first: '', last: '', full: '', ok: false };

  let first = '';
  let last = '';

  if (trimmed.includes(',')) {
    // "Last, First [Middle] [Suffix]" — strip any extra commas
    // (e.g., "Smith, John, Jr.") by treating them as separators.
    const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      last = parts[0];
      const afterTokens = parts.slice(1).join(' ').split(/\s+/).filter(Boolean);
      first = afterTokens[0] ?? '';
    } else {
      // Lone comma — treat as space-separated.
      const tokens = trimmed.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      first = tokens[0] ?? '';
      last = tokens[tokens.length - 1] ?? '';
    }
  } else {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    first = tokens[0] ?? '';
    // Strip trailing suffix tokens before picking last name.
    let endIdx = tokens.length - 1;
    while (endIdx > 0) {
      const tok = tokens[endIdx].toLowerCase().replace(/[.,]/g, '');
      if (NAME_SUFFIXES.has(tok)) endIdx--;
      else break;
    }
    last = endIdx >= 0 ? tokens[endIdx] : '';
    // If after stripping we collapsed to one token, no separate last name.
    if (endIdx <= 0) last = '';
  }

  const cleanToken = (s: string) =>
    s.toLowerCase().replace(/[^a-z'-]/g, '').trim();

  const firstClean = cleanToken(first);
  const lastClean = cleanToken(last);

  if (!firstClean && !lastClean) {
    return { first: '', last: '', full: '', ok: false };
  }

  const firstCanon = canonicalizeFirstName(firstClean);
  const full = [firstCanon, lastClean].filter(Boolean).join(' ');

  return {
    first: firstCanon,
    last: lastClean,
    full,
    ok: true,
  };
}

// ───────────────────────────────────────────────────────────────
// Jaro-Winkler similarity
// ───────────────────────────────────────────────────────────────

function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches: boolean[] = new Array(a.length).fill(false);
  const bMatches: boolean[] = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    matches / a.length +
    matches / b.length +
    (matches - transpositions / 2) / matches
  ) / 3;
}

/**
 * Jaro-Winkler similarity in [0, 1]. Prefix bonus weights matching
 * leading characters higher, which suits names well (most typos
 * happen mid- or end-string, not at the start).
 */
export function jaroWinkler(a: string, b: string): number {
  if (!a || !b) return 0;
  const jaro = jaroSimilarity(a, b);
  const prefixLen = Math.min(4, a.length, b.length);
  let prefix = 0;
  for (let i = 0; i < prefixLen; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// ───────────────────────────────────────────────────────────────
// Identifier comparison
// ───────────────────────────────────────────────────────────────

function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function normalizeDob(raw: string | null | undefined): string {
  // Accept ISO (YYYY-MM-DD) or common US (MM/DD/YYYY) and reduce to ISO
  // for comparison. If we can't parse, return the trimmed string as-is
  // so identical raw strings still match.
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (us) {
    const [, mm, dd, yy] = us;
    const year = yy.length === 2 ? (parseInt(yy, 10) > 30 ? `19${yy}` : `20${yy}`) : yy;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return trimmed.toLowerCase();
}

function safeNormalizePhone(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  try {
    const norm = normalizePhone(trimmed);
    return isValidE164(norm) ? norm : '';
  } catch {
    return '';
  }
}

// ───────────────────────────────────────────────────────────────
// Name similarity (combined first + last with nickname expansion)
// ───────────────────────────────────────────────────────────────

/**
 * Composite name similarity score in [0, 1].
 * Weights last name slightly higher than first name because last
 * names mutate less often (nicknames are common on first names).
 */
export function nameSimilarity(a: NormalizedName, b: NormalizedName): number {
  if (!a.ok || !b.ok) return 0;

  const firstScore = a.first && b.first ? jaroWinkler(a.first, b.first) : 0;
  const lastScore = a.last && b.last ? jaroWinkler(a.last, b.last) : 0;

  // If one side is missing a last name, fall back to the available signal.
  if (!a.last || !b.last) {
    return a.first && b.first ? firstScore : 0;
  }
  if (!a.first || !b.first) {
    return lastScore;
  }

  // 0.4 first + 0.6 last
  return firstScore * 0.4 + lastScore * 0.6;
}

// ───────────────────────────────────────────────────────────────
// Bucketing rules
// ───────────────────────────────────────────────────────────────

/**
 * Composite-name threshold for "fuzzy but plausible." Tuned (May 25, 2026)
 * so that real typo cases pass — Smith/Smyth ≈ 0.94, Johnson/Johnston ≈ 0.97,
 * Jon/John (shared last) ≈ 0.97 — but twin cases (John vs Jane, same last
 * name) score ~0.88 and fall through to the `weak` bucket instead of
 * being treated as a fuzzy-corroborated near-merge.
 */
const NAME_FUZZY_THRESHOLD = 0.9;
/** Threshold for surfacing a weak match even without corroborator. */
const NAME_FUZZY_NAME_ONLY_THRESHOLD = 0.92;

function classifyPair(
  a: ClientCandidate,
  b: ClientCandidate,
  nA: NormalizedName,
  nB: NormalizedName,
): DuplicateMatch | null {
  const nameScore = nameSimilarity(nA, nB);
  const nameExact = nA.full && nA.full === nB.full;

  const dobA = normalizeDob(a.dateOfBirth);
  const dobB = normalizeDob(b.dateOfBirth);
  const dobMatch = dobA && dobB && dobA === dobB;

  const phoneA = safeNormalizePhone(a.phone);
  const phoneB = safeNormalizePhone(b.phone);
  const phoneMatch = phoneA && phoneB && phoneA === phoneB;

  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  const emailMatch = emailA && emailB && emailA === emailB;

  const hasCorroborator = Boolean(dobMatch || phoneMatch || emailMatch);

  // Exact: name exact + at least one identifier matches.
  if (nameExact && dobMatch) {
    return { bucket: 'exact', confidence: 1.0, reason: 'name + DOB exact' };
  }
  if (nameExact && (phoneMatch || emailMatch)) {
    const which = phoneMatch ? 'phone' : 'email';
    return { bucket: 'exact', confidence: 0.97, reason: `name exact + ${which} match` };
  }

  // Strong: name exact, no identifier overlap. Per Daniel's call,
  // exact name alone is "enough to surface" but defaults to merge in UI.
  if (nameExact && !hasCorroborator) {
    // Only surface if the name is reasonably specific. Single-token
    // names like "smith" are too noisy without corroboration.
    if (nA.first && nA.last) {
      return { bucket: 'strong', confidence: 0.85, reason: 'name exact' };
    }
    return null;
  }

  // Fuzzy-corroborated: name close + identifier match.
  if (nameScore >= NAME_FUZZY_THRESHOLD && hasCorroborator) {
    const which = dobMatch ? 'DOB' : phoneMatch ? 'phone' : 'email';
    return {
      bucket: 'fuzzy-corroborated',
      confidence: 0.7 + (nameScore - NAME_FUZZY_THRESHOLD) * 1.5,
      reason: `name fuzzy (${nameScore.toFixed(2)}) + ${which} match`,
    };
  }

  // Fuzzy-name-only: high name similarity, no corroborator. Surface
  // but default to "create new" in the UI.
  if (nameScore >= NAME_FUZZY_NAME_ONLY_THRESHOLD && !hasCorroborator) {
    if (nA.first && nA.last && nB.first && nB.last) {
      return {
        bucket: 'fuzzy-name-only',
        confidence: 0.5 + (nameScore - NAME_FUZZY_NAME_ONLY_THRESHOLD) * 3,
        reason: `name fuzzy (${nameScore.toFixed(2)})`,
      };
    }
    return null;
  }

  // Weak: moderate name similarity with corroborator (e.g., same
  // phone, last name same, first name different — could be a spouse
  // with a data entry error, worth a glance).
  if (nameScore >= 0.75 && hasCorroborator) {
    const which = dobMatch ? 'DOB' : phoneMatch ? 'phone' : 'email';
    return {
      bucket: 'weak',
      confidence: 0.3 + (nameScore - 0.75) * 2,
      reason: `weak name match (${nameScore.toFixed(2)}) + ${which} match`,
    };
  }

  return null;
}

// ───────────────────────────────────────────────────────────────
// Blocking
// ───────────────────────────────────────────────────────────────

/**
 * Compute the blocking keys for a candidate. Two candidates are
 * compared if they share ANY block — last-name initial catches
 * typos within a surname; phone/email/DOB blocks catch cases where
 * the name diverges significantly (marriage, alias) but contact
 * info is intact.
 */
function blockKeysFor(c: ClientCandidate, n: NormalizedName): string[] {
  const keys: string[] = [];
  if (n.last) keys.push(`l:${n.last[0]}`);
  if (n.first && !n.last) keys.push(`f:${n.first[0]}`);
  const phone = safeNormalizePhone(c.phone);
  if (phone) keys.push(`p:${phone}`);
  const email = normalizeEmail(c.email);
  if (email) keys.push(`e:${email}`);
  const dob = normalizeDob(c.dateOfBirth);
  if (dob) keys.push(`d:${dob}`);
  return keys;
}

// ───────────────────────────────────────────────────────────────
// Group construction (union-find over pairwise matches)
// ───────────────────────────────────────────────────────────────

class UnionFind {
  private parent = new Map<string, string>();
  add(id: string) { if (!this.parent.has(id)) this.parent.set(id, id); }
  find(id: string): string {
    let p = this.parent.get(id) ?? id;
    while (p !== this.parent.get(p)) {
      const next = this.parent.get(p) ?? p;
      this.parent.set(p, this.parent.get(next) ?? next);
      p = this.parent.get(p) ?? p;
    }
    return p;
  }
  union(a: string, b: string) {
    this.add(a); this.add(b);
    const ra = this.find(a); const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const BUCKET_RANK: Record<MatchBucket, number> = {
  exact: 4, strong: 3, 'fuzzy-corroborated': 2, 'fuzzy-name-only': 1, weak: 0,
};

function worstBucket(buckets: MatchBucket[]): MatchBucket {
  return buckets.reduce(
    (worst, b) => (BUCKET_RANK[b] < BUCKET_RANK[worst] ? b : worst),
    'exact' as MatchBucket,
  );
}

/**
 * Pick the canonical client for a group. Heuristic: most policies wins;
 * ties broken by oldest createdAt; final tiebreak by lexicographic id
 * for stability.
 */
function pickCanonical(members: ClientCandidate[]): string {
  return [...members].sort((a, b) => {
    const ap = a.policyCount ?? 0;
    const bp = b.policyCount ?? 0;
    if (ap !== bp) return bp - ap;
    const at = toMillis(a.createdAt);
    const bt = toMillis(b.createdAt);
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  })[0].id;
}

function toMillis(v: Timestamp | Date | null | undefined): number {
  if (!v) return Number.POSITIVE_INFINITY;
  if (v instanceof Date) return v.getTime();
  // Firestore Timestamp
  if (typeof (v as Timestamp).toMillis === 'function') return (v as Timestamp).toMillis();
  return Number.POSITIVE_INFINITY;
}

// ───────────────────────────────────────────────────────────────
// In-memory scan (testable, no Firestore dependency)
// ───────────────────────────────────────────────────────────────

/**
 * Pure-function entry point: given the agent's full client list (with
 * optional policy counts), return candidate duplicate groups. Exported
 * for unit testing and so the create-time prevention path (Phase 4)
 * can reuse it against an already-loaded client list.
 */
export function scanForDuplicateGroups(candidates: ClientCandidate[]): DuplicateGroup[] {
  // Pre-normalize names once.
  const normalized = new Map<string, NormalizedName>();
  for (const c of candidates) {
    normalized.set(c.id, normalizeName(c.name));
  }

  // Build blocks.
  const blocks = new Map<string, ClientCandidate[]>();
  for (const c of candidates) {
    const n = normalized.get(c.id)!;
    if (!n.ok) continue;
    for (const key of blockKeysFor(c, n)) {
      const arr = blocks.get(key) ?? [];
      arr.push(c);
      blocks.set(key, arr);
    }
  }

  // Pairwise compare within blocks, dedup pairs across overlapping blocks.
  const seenPairs = new Set<string>();
  const edges: Array<{ aId: string; bId: string; match: DuplicateMatch }> = [];
  for (const arr of blocks.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]; const b = arr[j];
        if (a.id === b.id) continue;
        const pairKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        // Respect agent-declared not-a-duplicate marks.
        if (a.notDuplicateOf?.includes(b.id)) continue;
        if (b.notDuplicateOf?.includes(a.id)) continue;

        const nA = normalized.get(a.id)!;
        const nB = normalized.get(b.id)!;
        const match = classifyPair(a, b, nA, nB);
        if (!match) continue;
        edges.push({ aId: a.id, bId: b.id, match });
      }
    }
  }

  // Union connected components.
  const uf = new UnionFind();
  for (const e of edges) uf.union(e.aId, e.bId);

  // Bucket edges by component root.
  const componentEdges = new Map<string, typeof edges>();
  const componentMembers = new Map<string, Set<string>>();
  for (const e of edges) {
    const root = uf.find(e.aId);
    const list = componentEdges.get(root) ?? [];
    list.push(e);
    componentEdges.set(root, list);
    const members = componentMembers.get(root) ?? new Set<string>();
    members.add(e.aId); members.add(e.bId);
    componentMembers.set(root, members);
  }

  // Assemble groups.
  const groups: DuplicateGroup[] = [];
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  for (const [root, memberIds] of componentMembers.entries()) {
    const members = Array.from(memberIds)
      .map((id) => candidateById.get(id))
      .filter((c): c is ClientCandidate => Boolean(c));
    if (members.length < 2) continue;
    const groupEdges = componentEdges.get(root) ?? [];
    const bucket = worstBucket(groupEdges.map((e) => e.match.bucket));
    groups.push({
      members,
      suggestedCanonicalId: pickCanonical(members),
      bucket,
      matches: groupEdges,
    });
  }

  // Stable ordering: strongest buckets first, then largest groups,
  // then by canonical id for determinism.
  groups.sort((a, b) => {
    const ar = BUCKET_RANK[a.bucket]; const br = BUCKET_RANK[b.bucket];
    if (ar !== br) return br - ar;
    if (a.members.length !== b.members.length) return b.members.length - a.members.length;
    return a.suggestedCanonicalId.localeCompare(b.suggestedCanonicalId);
  });
  return groups;
}

// ───────────────────────────────────────────────────────────────
// Firestore-backed entry points
// ───────────────────────────────────────────────────────────────

interface ClientDocShape {
  name?: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  notDuplicateOf?: string[];
  createdAt?: Timestamp | null;
  deleted?: boolean;
}

async function loadClients(
  db: Firestore,
  agentId: string,
  opts: { includePolicyCounts: boolean },
): Promise<ClientCandidate[]> {
  const snap = await db.collection('agents').doc(agentId).collection('clients').get();
  const candidates: ClientCandidate[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as ClientDocShape;
    if (data.deleted) continue;
    candidates.push({
      id: doc.id,
      name: data.name ?? '',
      dateOfBirth: data.dateOfBirth ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      notDuplicateOf: Array.isArray(data.notDuplicateOf) ? data.notDuplicateOf : [],
      createdAt: data.createdAt ?? null,
    });
  }

  if (opts.includePolicyCounts && candidates.length > 0) {
    // Best-effort policy count. We do this in parallel batches so a
    // large book doesn't serialize a thousand subcollection reads.
    const BATCH = 20;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const slice = candidates.slice(i, i + BATCH);
      await Promise.all(slice.map(async (c) => {
        try {
          const polSnap = await db
            .collection('agents').doc(agentId)
            .collection('clients').doc(c.id)
            .collection('policies').count().get();
          c.policyCount = polSnap.data().count ?? 0;
        } catch {
          c.policyCount = 0;
        }
      }));
    }
  }

  return candidates;
}

/**
 * Public loader: the agent's active clients as match candidates (no
 * policy counts). Exposed so create-time paths that match many probes —
 * e.g. the bulk CSV importer — can load the book ONCE and pass it to
 * matchProbeAgainst repeatedly, instead of re-reading the whole
 * collection per row.
 */
export async function loadClientCandidates(
  db: Firestore,
  agentId: string,
): Promise<ClientCandidate[]> {
  return loadClients(db, agentId, { includePolicyCounts: false });
}

/**
 * Whole-account scan. Powers the "Find duplicates" review screen.
 * Returns candidate groups sorted highest-confidence first.
 */
export async function findDuplicateCandidates(
  db: Firestore,
  agentId: string,
): Promise<DuplicateGroup[]> {
  const candidates = await loadClients(db, agentId, { includePolicyCounts: true });
  return scanForDuplicateGroups(candidates);
}

export interface ExistingClientMatch {
  clientId: string;
  match: DuplicateMatch;
}

/**
 * Pure single-probe matcher over an ALREADY-LOADED client list. Returns
 * the best (highest-bucket) match for `candidate`, or null if nothing
 * clears the thresholds.
 *
 * Split out of findExistingClient so create-time loops — notably the
 * bulk CSV importer — can load the book once (loadClientCandidates) and
 * match many probes in memory instead of re-reading the whole collection
 * per row.
 *
 * The candidate's `id` is not used for matching — pass anything (e.g.
 * 'new'). `notDuplicateOf` is read off the existing client docs, not the
 * candidate (the candidate isn't persisted yet).
 */
export function matchProbeAgainst(
  existing: ClientCandidate[],
  candidate: Omit<ClientCandidate, 'id'> & { id?: string },
): ExistingClientMatch | null {
  if (existing.length === 0) return null;

  const probe: ClientCandidate = {
    id: candidate.id ?? '__probe__',
    name: candidate.name,
    dateOfBirth: candidate.dateOfBirth ?? null,
    phone: candidate.phone ?? null,
    email: candidate.email ?? null,
    notDuplicateOf: [],
  };
  const probeNorm = normalizeName(probe.name);
  if (!probeNorm.ok) return null;

  // Reuse blocking to avoid scanning the whole book.
  const probeKeys = new Set(blockKeysFor(probe, probeNorm));

  let best: ExistingClientMatch | null = null;
  for (const c of existing) {
    const n = normalizeName(c.name);
    if (!n.ok) continue;
    const keys = blockKeysFor(c, n);
    if (!keys.some((k) => probeKeys.has(k))) continue;
    if (c.notDuplicateOf?.includes(probe.id)) continue;
    const m = classifyPair(probe, c, probeNorm, n);
    if (!m) continue;
    if (
      !best ||
      BUCKET_RANK[m.bucket] > BUCKET_RANK[best.match.bucket] ||
      (m.bucket === best.match.bucket && m.confidence > best.match.confidence)
    ) {
      best = { clientId: c.id, match: m };
    }
  }
  return best;
}

/**
 * Single-candidate lookup. Called from create-time paths (PDF parse /
 * manual add / lead convert) BEFORE we write a new client doc. Returns
 * the best (highest-bucket) match for the candidate among the agent's
 * existing clients, or null if no match clears the thresholds.
 *
 * The candidate's `id` is not used — pass anything (e.g., 'new').
 * `notDuplicateOf` is read off the existing client docs, not the
 * candidate (since the candidate isn't persisted yet).
 */
export async function findExistingClient(
  db: Firestore,
  agentId: string,
  candidate: Omit<ClientCandidate, 'id'> & { id?: string },
): Promise<ExistingClientMatch | null> {
  const existing = await loadClientCandidates(db, agentId);
  return matchProbeAgainst(existing, candidate);
}
