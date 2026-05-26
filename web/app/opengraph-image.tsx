/**
 * File-based Open Graph image. Next.js auto-wires this into the root
 * page's <meta property="og:image"> tag (1200×630 PNG). Shared render
 * lives in `./og-card.tsx` so the Twitter card stays identical.
 */
import { renderOgCard, SIZE, ALT, CONTENT_TYPE } from './og-card';

export const alt = ALT;
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function OpengraphImage() {
  return renderOgCard();
}
