import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Shared link-preview card renderer. Used by both `opengraph-image.tsx`
 * (Open Graph / Facebook / LinkedIn / WhatsApp / iMessage) and
 * `twitter-image.tsx` (Twitter / X). Keeping the render here means both
 * sides ship the same 1200×630 PNG and a copy/design change only has
 * to happen once.
 *
 * Implementation notes:
 *   - Inlines the logo as base64 at request time so the OG worker
 *     doesn't have to make an outbound fetch to its own public asset
 *     during scrape. Runs in Node runtime (default) so `fs` works.
 *   - No custom font — Satori's bundled sans-serif renders cleanly at
 *     these sizes and avoids the Google Fonts roundtrip. Worth
 *     revisiting if we want true Montserrat parity with the marketing
 *     site, but for v1 the typography reads as a clean bold sans.
 *   - Every text node lives inside an explicit `display: flex`
 *     container — Satori requires it (no implicit block layout).
 */

export const SIZE = { width: 1200, height: 630 } as const;
export const ALT = 'AgentForLife™ — Kill Chargebacks & Explode Your Referrals';
export const CONTENT_TYPE = 'image/png';

export async function renderOgCard() {
  const logoPath = join(process.cwd(), 'public', 'logo.png');
  const logoData = readFileSync(logoPath);
  const logoDataUrl = `data:image/png;base64,${logoData.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 80px',
          background:
            'linear-gradient(135deg, #0D4D4D 0%, #1A7A6A 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo — infinity mark only, no wordmark embedded. Scaled
            from native 622×332 down to 320×171 (same aspect ratio)
            so it sits as a brand anchor above the wordmark. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoDataUrl}
          alt="AgentForLife"
          width={320}
          height={171}
          style={{ marginBottom: 28 }}
        />

        {/* Wordmark — the logo alone isn't widely recognized yet, so
            spell it out. WhatsApp/iMessage previews crop tightly and
            the URL line beneath the image is easy to miss. The ™
            is set in bright teal at a smaller size, baseline-aligned
            via the row's `alignItems: flex-start`, so it reads as a
            trademark mark rather than a stray letter. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            color: '#FFFFFF',
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: -2,
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex' }}>AgentForLife</div>
          <div
            style={{
              display: 'flex',
              color: '#3DD6C3',
              fontSize: 32,
              fontWeight: 700,
              marginLeft: 6,
              marginTop: 4,
            }}
          >
            ™
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            fontSize: 48,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -1,
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', color: '#FFFFFF' }}>
            Kill Chargebacks.
          </div>
          <div style={{ display: 'flex', color: '#3DD6C3' }}>
            Explode Your Referrals.
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
    },
  );
}
