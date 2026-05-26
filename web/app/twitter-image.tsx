/**
 * File-based Twitter card image. Auto-wires into <meta name="twitter:image">.
 * Renders the same 1200×630 card as the Open Graph file so cross-platform
 * link previews are visually identical. `twitter.card` in layout.tsx
 * stays `summary_large_image` so this fills the wide preview slot.
 */
import { renderOgCard, SIZE, ALT, CONTENT_TYPE } from './og-card';

export const alt = ALT;
export const size = SIZE;
export const contentType = CONTENT_TYPE;

export default async function TwitterImage() {
  return renderOgCard();
}
