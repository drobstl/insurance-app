/**
 * Platform-default FAQ videos for the mobile lead-home — the single source of
 * truth shared by the server manifest (`/api/mobile/lead-content`) and the
 * agent-facing Settings preview (so the two can never drift).
 *
 * NOT server-only: imported by both the API route and the Settings UI. These
 * are public Bunny CDN URLs (library 672807), so there's nothing secret here.
 *
 * Serving rule (see resolveFaqs in the manifest): unless the agent opted out
 * or uploaded their own FAQ, every lead gets an age-aware clip + the universal
 * work clip. Confirmed under-40s get the "young" clip; everyone else (40+ or
 * unknown age) gets the "cost" clip.
 */

export const YOUNG_FAQ_MAX_AGE = 40;

export interface LeadFaqDefault {
  id: string;
  title: string;
  url: string;          // HLS playlist — what the mobile player plays.
  iframeUrl: string;    // Bunny hosted player — used for in-browser preview.
  thumbnailUrl: string;
  videoId: string;
  durationSec: number;
}

export const LEAD_FAQ_DEFAULT_YOUNG: LeadFaqDefault = {
  id: 'faq-default-young',
  title: 'I’m young and healthy — do I really need this now?',
  url: 'https://vz-a54402da-888.b-cdn.net/7b3ebe94-fbd8-453e-ba92-6007fa8848dd/playlist.m3u8',
  iframeUrl: 'https://iframe.mediadelivery.net/embed/672807/7b3ebe94-fbd8-453e-ba92-6007fa8848dd',
  thumbnailUrl: 'https://vz-a54402da-888.b-cdn.net/7b3ebe94-fbd8-453e-ba92-6007fa8848dd/thumbnail.jpg',
  videoId: '7b3ebe94-fbd8-453e-ba92-6007fa8848dd',
  durationSec: 57,
};

export const LEAD_FAQ_DEFAULT_COST: LeadFaqDefault = {
  id: 'faq-default-cost',
  title: 'Won’t this cost too much — and would I even qualify?',
  url: 'https://vz-a54402da-888.b-cdn.net/eed95098-f294-488d-a8c9-04d1412d0794/playlist.m3u8',
  iframeUrl: 'https://iframe.mediadelivery.net/embed/672807/eed95098-f294-488d-a8c9-04d1412d0794',
  thumbnailUrl: 'https://vz-a54402da-888.b-cdn.net/eed95098-f294-488d-a8c9-04d1412d0794/thumbnail.jpg',
  videoId: 'eed95098-f294-488d-a8c9-04d1412d0794',
  durationSec: 53,
};

export const LEAD_FAQ_DEFAULT_WORK: LeadFaqDefault = {
  id: 'faq-default-work',
  title: 'Don’t I already have enough through work?',
  url: 'https://vz-a54402da-888.b-cdn.net/179478cb-9a68-4adc-951f-91088056e8f7/playlist.m3u8',
  iframeUrl: 'https://iframe.mediadelivery.net/embed/672807/179478cb-9a68-4adc-951f-91088056e8f7',
  thumbnailUrl: 'https://vz-a54402da-888.b-cdn.net/179478cb-9a68-4adc-951f-91088056e8f7/thumbnail.jpg',
  videoId: '179478cb-9a68-4adc-951f-91088056e8f7',
  durationSec: 55,
};

/**
 * Agent-facing list for the Settings preview — each default plus a plain-English
 * line about which leads see it. Order matches what a lead sees (age-aware
 * first, then the universal work clip).
 */
export const LEAD_FAQ_DEFAULTS: Array<LeadFaqDefault & { audience: string }> = [
  { ...LEAD_FAQ_DEFAULT_YOUNG, audience: 'Leads under 40' },
  { ...LEAD_FAQ_DEFAULT_COST, audience: 'Leads 40 and older' },
  { ...LEAD_FAQ_DEFAULT_WORK, audience: 'All leads' },
];
