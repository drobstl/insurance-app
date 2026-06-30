import { resolveLeadTags, tagChipClasses, type LeadTag } from '../lib/lead-tag';

/**
 * Read-only tag chips for a lead. Resolves `tagIds` against the agent's tag
 * definitions (dropping any dangling ids — lazy reconcile) and renders soft
 * colored chips as a fragment so it drops into an existing flex-wrap chip
 * cluster. Renders nothing when the lead has no resolvable tags.
 */
export function LeadTagChips({ tagIds, tags }: { tagIds?: string[]; tags: LeadTag[] }) {
  const resolved = resolveLeadTags(tagIds, tags);
  if (resolved.length === 0) return null;
  return (
    <>
      {resolved.map((t) => (
        <span
          key={t.id}
          className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wide rounded ${tagChipClasses(t.color)}`}
        >
          {t.label}
        </span>
      ))}
    </>
  );
}
