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
