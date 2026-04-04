'use client';

import DesktopLandingV5 from '../v5/page';

export default function ClosrStylePage() {
  return (
    <main className="marketing-light closr-style-route min-h-screen bg-[#F5F0E8] text-[#1a1a1a]">
      <DesktopLandingV5 />
      <style jsx global>{`
        .closr-style-route {
          background-color: #f5f0e8 !important;
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif;
        }

        .closr-style-route > div {
          background-color: #f5f0e8 !important;
        }

        .closr-style-route h1,
        .closr-style-route h2,
        .closr-style-route h3,
        .closr-style-route h4,
        .closr-style-route h5,
        .closr-style-route h6 {
          font-family: var(--font-serif), 'EB Garamond', Georgia, 'Times New Roman', serif !important;
          color: rgb(26, 26, 26) !important;
        }

        .closr-style-route p,
        .closr-style-route a,
        .closr-style-route span,
        .closr-style-route li,
        .closr-style-route label,
        .closr-style-route button {
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif;
        }

        /* Hero typography treatment */
        .closr-style-route section:first-of-type h1 {
          font-family: var(--font-serif), 'EB Garamond', Georgia, 'Times New Roman', serif !important;
          font-weight: 500 !important;
          color: rgba(26, 26, 26, 0.55) !important;
        }

        .closr-style-route section:first-of-type h1 span {
          color: rgb(26, 26, 26) !important;
          font-weight: 700 !important;
        }

        /* Nav CTA = bordered pill */
        .closr-style-route nav a[class*='bg-[#fdcc02]'] {
          background: transparent !important;
          color: hsl(var(--primary)) !important;
          border: 2px solid hsl(var(--primary)) !important;
          border-radius: 9999px !important;
          padding: 0.5rem 1.25rem !important;
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif !important;
          font-weight: 600 !important;
          box-shadow: none !important;
        }

        /* Hero CTA = teal pill, no arrow */
        .closr-style-route section:first-of-type a[class*='bg-[#fdcc02]'] {
          background: hsl(var(--primary)) !important;
          color: hsl(var(--primary-foreground)) !important;
          border: none !important;
          border-radius: 9999px !important;
          padding: 0.75rem 1.5rem !important;
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif !important;
          font-weight: 600 !important;
        }

        .closr-style-route section:first-of-type a[class*='bg-[#fdcc02]'] svg {
          display: none !important;
        }

        /* Dark sections -> rounded floating cards on cream background */
        .closr-style-route section[style*='#070E1B'] {
          background: rgb(26, 26, 26) !important;
          border-radius: 1rem !important;
          max-width: 72rem;
          margin: 1.5rem auto !important;
          overflow: hidden;
        }

        /* Teal sections -> rounded floating teal cards */
        .closr-style-route section[style*='#070E1B'] {
          background: rgb(26, 26, 26) !important;
        }

        .closr-style-route section[style*='#0D4D4D'],
        .closr-style-route section[class*='bg-[#0D4D4D]'] {
          background: rgb(15, 95, 86) !important;
          border-radius: 1rem !important;
          max-width: 72rem;
          margin: 1.5rem auto !important;
          overflow: hidden;
        }

        /* Purple section to lavender-light */
        .closr-style-route section[class*='bg-[#a158ff]'] {
          background-color: hsl(var(--lavender-light)) !important;
          border-radius: 1rem !important;
          max-width: 72rem;
          margin: 1.5rem auto !important;
          overflow: hidden;
        }

        /* Keep body/UI text sans */
        .closr-style-route p,
        .closr-style-route a,
        .closr-style-route button,
        .closr-style-route li,
        .closr-style-route label {
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif !important;
        }

        /* Feature cards */
        .closr-style-route [class*='rounded-2xl'][class*='border'],
        .closr-style-route [class*='rounded-xl'][class*='border'] {
          border-width: 2px !important;
          border-color: hsl(var(--card-border)) !important;
          border-radius: 0.75rem !important;
          box-shadow: var(--card-shadow) !important;
        }

        /* Reduce legacy bright text accents to deeper neutral/teal */
        .closr-style-route [class*='text-[#fdcc02]'] {
          color: hsl(var(--primary)) !important;
        }

        .closr-style-route [class*='text-white'],
        .closr-style-route [class*='text-white/'] {
          color: rgba(245, 240, 232, 0.92) !important;
        }
      `}</style>
    </main>
  );
}
