/**
 * Carrier / application-type options used across upload surfaces:
 *   - Add Client (ApplicationUpload component)
 *   - Add Policy (clients/page.tsx inline modal)
 *   - Close Sale (CloseSaleRitual component)
 *
 * Single source of truth. When a new carrier is supported (i.e. when a
 * new entry is added to `web/lib/pdf/application-page-map.ts` and a
 * corresponding prompt supplement on the server), append a new option
 * here so it shows up in every dropdown automatically.
 *
 * The `value` strings must match keys in APPLICATION_PAGE_MAP and the
 * server-side prompt-supplement registry — that mapping is how the
 * carrier choice translates into rendering specific pages and applying
 * carrier-specific extraction guidance.
 */

export type ApplicationFormType = string;

export const APPLICATION_TYPE_OPTIONS: Array<{ label: string; value: ApplicationFormType }> = [
  { label: 'Americo - Term or CBO', value: 'americo_icc18_5160' },
  { label: 'Americo - IUL', value: 'americo_icc18_5160_iul' },
  { label: 'Americo - Whole Life', value: 'americo_icc24_5426' },
  { label: 'American-Amicable - Mortgage Protection', value: 'amam_icc15_aa9466' },
  { label: 'American-Amicable - Term', value: 'amam_icc18_aa3487' },
  { label: 'Foresters - Term Life', value: 'foresters_icc15_770825' },
  { label: 'United Home Life - Term', value: 'uhl_icc22_200_878a' },
  { label: 'United Home Life - GIWL', value: 'uhl_icc20_200_854a_giwl' },
  { label: 'Transamerica - Whole Life', value: 'transamerica_icc22_t_ap_wl11ic_0822' },
  { label: 'Corebridge/AIG', value: 'corebridge_aig_icc15_108847' },
  { label: 'SBLI - Policy Packet', value: 'sbli_policy_packet' },
  { label: 'F&G - IUL', value: 'fg_iul' },
  { label: 'Mutual of Omaha - Term Life Express / IUL Express', value: 'moo_icc22_l683a' },
  { label: 'Mutual of Omaha - Living Promise', value: 'moo_icc23_l681a' },
  { label: 'Mutual of Omaha - Accidental Death', value: 'moo_ma5981' },
  { label: 'Banner/LGA - Term', value: 'banner_lga_icc17_lia' },
  { label: 'Other Carrier', value: 'unknown' },
];

/**
 * Sentinel used by the legacy Add Client / Add Policy flows where a
 * pre-selected default makes sense. Close Sale deliberately starts
 * with NO selection and disables Upload until the agent picks one
 * (see CONTEXT.md → Close Sale follow-up section).
 */
export const DEFAULT_APPLICATION_TYPE: ApplicationFormType = 'unknown';
