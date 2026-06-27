// Pure, runtime-light household constants + types shared by BOTH client
// components and server routes. No 'use client', no react/firebase imports —
// so the convert API route (server) and the leads/clients pages (client) can
// agree on the same relationship vocabulary and household-role strings.
//
// web/lib/household.ts (a 'use client' module) re-exports Relationship +
// RELATIONSHIPS from here so existing imports keep working.

export type Relationship =
  | 'spouse'
  | 'partner'
  | 'child'
  | 'parent'
  | 'sibling'
  | 'grandparent'
  | 'other';

export const RELATIONSHIPS: Relationship[] = [
  'spouse',
  'partner',
  'child',
  'parent',
  'sibling',
  'grandparent',
  'other',
];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  spouse: 'Spouse',
  partner: 'Partner',
  child: 'Child',
  parent: 'Parent',
  sibling: 'Sibling',
  grandparent: 'Grandparent',
  other: 'Other',
};

/**
 * A client's place in a converted household.
 *  - 'primary'  the lead itself (relationship === 'self')
 *  - 'member'   a Person who had their own application written (relationship
 *               is that person's relationship to the primary)
 */
export type HouseholdRole = 'primary' | 'member';

/** Relationship label relative to the primary, where 'self' is the primary. */
export type HouseholdRelationship = Relationship | 'self';

export function relationshipLabel(rel?: string | null): string {
  if (!rel || rel === 'self') return '';
  return RELATIONSHIP_LABELS[rel as Relationship] || 'Family';
}
