import { isAdminEmail } from './admin';

/**
 * Global feature flags for AFL.
 *
 * NEXT_PUBLIC_LEAD_MODE_ENABLED — gates the entire pre-application
 * lead-mode surface: Leads sidebar nav (renders strikethrough + "Coming
 * soon" chip when off), mobile bottom-nav slot (omitted when off),
 * /dashboard/leads + /dashboard/leads/[leadId] routes (redirect to
 * /dashboard when off), Convert-to-Client (lives inside the gated
 * surface so it goes along for the ride), and the lead-PDF auto-archive
 * cron (returns skipped when off).
 *
 * What stays visible regardless: Clients tab, Add Client, upload
 * application, welcome flow, action items, conservation, retention,
 * rewrites, and every existing cron other than lead-PDF-archive.
 * Daniel's framing: "anything that would come before writing the
 * application" is behind this flag; everything else stays put.
 *
 * NEXT_PUBLIC_ vars are inlined at build time, so this constant is safe
 * to import in both server and client components. Flipping the value in
 * Vercel requires a redeploy to take effect — there is no runtime read.
 *
 * Set to the string "true" to enable; anything else (unset, "0", typo,
 * empty) is treated as off.
 */
export const LEAD_MODE_ENABLED =
  process.env.NEXT_PUBLIC_LEAD_MODE_ENABLED === 'true';

/**
 * NEXT_PUBLIC_LEAD_MODE_ADMIN_ONLY — second-axis gate stacked on top of
 * LEAD_MODE_ENABLED. When `"true"`, the lead-mode surface is visible
 * ONLY to admin emails (per NEXT_PUBLIC_ADMIN_EMAILS / `isAdminEmail`).
 * Every other logged-in agent gets the same treatment as when
 * LEAD_MODE_ENABLED is off (sidebar shows "Coming soon", mobile nav
 * omits the item, routes redirect to /dashboard).
 *
 * Use this to ship lead mode to prod and dogfood on the live App Store
 * app as the admin agent, without exposing it to the rest of the
 * agent base. To GA the surface: set this back to `"false"` (or unset)
 * and redeploy. When `LEAD_MODE_ENABLED` is off, this flag does nothing
 * — admin-only requires the global flag to be on first.
 *
 * The cron (`/api/cron/lead-pdf-archive`) intentionally does NOT respect
 * this flag — it has no per-user concept, gates on `LEAD_MODE_ENABLED`
 * only. Safe because non-admin agents can't create lead docs (the UI
 * to do so is gated), so the cron has nothing to archive for them.
 */
export const LEAD_MODE_ADMIN_ONLY =
  process.env.NEXT_PUBLIC_LEAD_MODE_ADMIN_ONLY === 'true';

/**
 * Resolves the effective lead-mode visibility for a given user email.
 * Use this in every client-side gate (sidebar, mobile nav, route
 * guards, in-page conditionals) — do NOT read `LEAD_MODE_ENABLED`
 * directly from a client component, or you'll bypass the admin-only
 * axis and leak the surface.
 *
 *   visible = LEAD_MODE_ENABLED && (!LEAD_MODE_ADMIN_ONLY || isAdmin)
 *
 * Passes through `null` / `undefined` / empty email as non-admin.
 */
export function isLeadModeVisibleForEmail(
  email: string | null | undefined,
): boolean {
  if (!LEAD_MODE_ENABLED) return false;
  if (!LEAD_MODE_ADMIN_ONLY) return true;
  return isAdminEmail(email);
}

/**
 * NEXT_PUBLIC_ACTIVITY_ENABLED — gates the agent KPI dashboard at
 * /dashboard/activity (dials, contacts, booked, sales, APV, saved APV,
 * funnel, recent wins). When off, the Activity sidebar nav item
 * renders strikethrough + "Coming soon" chip, the route redirects to
 * /dashboard, and the underlying /api/agent/activity endpoint returns
 * a 404. Same flip-requires-redeploy mechanics as LEAD_MODE_ENABLED.
 */
export const ACTIVITY_ENABLED =
  process.env.NEXT_PUBLIC_ACTIVITY_ENABLED === 'true';

/**
 * NEXT_PUBLIC_BOOKED_LEAD_APP_AVAILABLE — gates the "Plus" callout on
 * the Leads paywall (the branded prep page for booked leads — agent
 * video, intake assessment, client testimonials). When `"true"`, the
 * callout renders below the Leads paywall bullets, parallel to the
 * AI-coaching callout on the Activity paywall. When off / unset, the
 * Leads paywall renders without the callout (current production state).
 *
 * Promise-before-feature guard: copy + structure ship to code while
 * gated off so we can flip the env var in Vercel on the day the prep
 * app actually lands — no scramble to write copy in the moment, no
 * refund risk from promising a feature that doesn't exist yet.
 *
 * Same flip-requires-redeploy mechanics as LEAD_MODE_ENABLED.
 */
export const BOOKED_LEAD_APP_AVAILABLE =
  process.env.NEXT_PUBLIC_BOOKED_LEAD_APP_AVAILABLE === 'true';
