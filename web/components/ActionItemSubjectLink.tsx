'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Makes an action-item's subject name clickable → that person's profile.
 *
 *  - client  (`clientId`)   → /dashboard/clients?client=<id>  (the clients
 *    page reads the param and opens that client's detail panel)
 *  - lead    (`prospectId`) → /dashboard/leads/<id>           (routable page)
 *  - neither                → renders the name as plain text (no link)
 *
 * Inherits the surrounding type (Tailwind preflight makes <button> inherit
 * font + color), adding only a subtle dotted-underline link affordance. Stops
 * propagation so it never triggers a parent card's own click handlers.
 */
export function ActionItemSubjectLink({
  clientId,
  prospectId,
  children,
}: {
  clientId?: string | null;
  prospectId?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const href = clientId
    ? `/dashboard/clients?client=${clientId}`
    : prospectId
      ? `/dashboard/leads/${prospectId}`
      : null;

  if (!href) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        router.push(href);
      }}
      className="underline decoration-dotted underline-offset-2 hover:text-[#005851] hover:decoration-solid"
      title="Open profile"
    >
      {children}
    </button>
  );
}
