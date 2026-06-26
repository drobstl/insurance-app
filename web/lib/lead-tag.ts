/**
 * Lead tags — agent-defined labels for slicing their book.
 *
 * Definitions live on the agent doc (`agents/{uid}.leadTags`, mirrored into
 * `agentProfile` via DashboardContext — the same pattern as `fifResetSmes`);
 * each lead carries `tagIds: string[]`. Filtering/search over tags happens
 * client-side on the already-loaded leads, so no Firestore index is needed.
 *
 * Tag-definition deletes reconcile LAZILY: a lead may keep a `tagId` whose
 * definition is gone; `resolveLeadTags` just drops ids with no definition, so
 * a delete is one cheap agent-doc write, never a fan-out over the whole book.
 */

export type LeadTagColor =
  | 'teal'
  | 'blue'
  | 'green'
  | 'gold'
  | 'rose'
  | 'purple'
  | 'orange'
  | 'gray';

export interface LeadTag {
  id: string;
  label: string;
  color: LeadTagColor;
}

export const MAX_LEAD_TAGS = 30;
export const MAX_TAG_LABEL_LEN = 28;

export const LEAD_TAG_COLOR_ORDER: readonly LeadTagColor[] = [
  'teal',
  'blue',
  'green',
  'gold',
  'rose',
  'purple',
  'orange',
  'gray',
] as const;

// Soft, informational palettes — same family as the appointment-outcome
// chips (`appointment-outcome-chip.ts`) so tags sit visually alongside them
// on the lead row instead of competing with the interactive button colors.
const PALETTE: Record<LeadTagColor, string> = {
  teal: 'bg-[#daf3f0] text-[#005851] border border-[#45bcaa]/40',
  blue: 'bg-[#E0F0FF] text-[#0079CC] border border-[#0099FF]/30',
  green: 'bg-[#E7F7EF] text-[#0B7A4B] border border-[#12B76A]/40',
  gold: 'bg-[#FFF4D6] text-[#92500D] border border-[#F0B100]/50',
  rose: 'bg-[#FFE4E1] text-[#A0382A] border border-[#FF6B5C]/30',
  purple: 'bg-[#EFE7FB] text-[#6B3FA0] border border-[#9B6BDF]/40',
  orange: 'bg-[#FFEAD5] text-[#B54708] border border-[#FB6514]/40',
  gray: 'bg-gray-100 text-gray-700 border border-gray-300',
};

// A bolder swatch (solid-ish) for the color picker dots.
const SWATCH: Record<LeadTagColor, string> = {
  teal: 'bg-[#45bcaa]',
  blue: 'bg-[#0099FF]',
  green: 'bg-[#12B76A]',
  gold: 'bg-[#F0B100]',
  rose: 'bg-[#FF6B5C]',
  purple: 'bg-[#9B6BDF]',
  orange: 'bg-[#FB6514]',
  gray: 'bg-gray-400',
};

export function isLeadTagColor(v: unknown): v is LeadTagColor {
  return typeof v === 'string' && (LEAD_TAG_COLOR_ORDER as readonly string[]).includes(v);
}

export function tagChipClasses(color: LeadTagColor): string {
  return PALETTE[color] ?? PALETTE.gray;
}

export function tagSwatchClass(color: LeadTagColor): string {
  return SWATCH[color] ?? SWATCH.gray;
}

export function normalizeTagLabel(label: string): string {
  return (label || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LABEL_LEN);
}

/**
 * Resolve a lead's `tagIds` against the agent's definitions, in tagIds order,
 * dropping any id whose definition no longer exists (lazy reconcile).
 */
export function resolveLeadTags(tagIds: string[] | undefined, defs: LeadTag[]): LeadTag[] {
  if (!tagIds || tagIds.length === 0 || defs.length === 0) return [];
  const byId = new Map(defs.map((t) => [t.id, t]));
  const out: LeadTag[] = [];
  for (const id of tagIds) {
    const def = byId.get(id);
    if (def) out.push(def);
  }
  return out;
}

/** Validate + normalize a raw `leadTags` array read off the agent doc. */
export function parseLeadTags(value: unknown): LeadTag[] {
  if (!Array.isArray(value)) return [];
  const out: LeadTag[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { id?: unknown; label?: unknown; color?: unknown };
    const id = typeof r.id === 'string' ? r.id : '';
    const label = normalizeTagLabel(typeof r.label === 'string' ? r.label : '');
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label, color: isLeadTagColor(r.color) ? r.color : 'gray' });
  }
  return out.slice(0, MAX_LEAD_TAGS);
}

export function newLeadTagId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
