/**
 * Client-safe builder for the Mode 1 welcome SMS body. Mirrors the
 * canonical copy in `web/lib/welcome-action-item-writer.ts`
 * (`buildPhase1WelcomeBody`, rewritten Jun 2, 2026 — login code surfaced
 * to step 2, steps reordered to match the actual app flow) so the Close
 * Sale Card 2 can pre-fill the textarea without needing a server round trip.
 *
 * The server-side writer also queues the welcome action item with this
 * same body on its displayContext — so once the agent sends from
 * Close Sale, the queue's pending welcome item is in sync. If the
 * agent never gets to Close Sale's Card 2 (or closes mid-ritual), the
 * action item is still there as a safety net (per CONTEXT.md →
 * close-sale resume policy).
 *
 * Spanish path lives only on the server-side writer for now — Close
 * Sale is English-only in v1 per Daniel.
 *
 * Why duplicated rather than imported: the writer module is marked
 * `'server-only'` for Firestore admin reasons. Keeping a small mirror
 * here is the lesser evil compared to a refactor that splits the
 * server doc-mutating logic from the pure copy. Update both when the
 * copy is changed.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/$/, '');
const APP_DOWNLOAD_URL = `${APP_URL}/app`;

export function buildCloseSaleWelcomeBody(params: {
  clientFirstName: string;
  agentName: string;
  clientCode: string;
}): string {
  const firstName = params.clientFirstName || 'there';
  const agentName = params.agentName || 'your agent';
  return (
    `Hey ${firstName}! ${agentName} here — let's get you set up (takes a minute):\n\n`
    + `1. Download the app: ${APP_DOWNLOAD_URL}\n`
    + `2. Open it and enter your code: ${params.clientCode}\n`
    + '3. Tap Allow on notifications so I can reach you with important updates\n'
    + "4. Tap Activate, then Send — I'll text you right back\n\n"
    + "That's it! Your app's already personalized for you. 👍"
  );
}
