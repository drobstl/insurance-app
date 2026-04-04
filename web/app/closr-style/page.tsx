'use client';

import DesktopLandingV5 from '../v5/page';

export default function ClosrStylePage() {
  return (
    <main className="marketing-light closr-style-route min-h-screen bg-[#F5F0E8] text-[#1a1a1a]">
      <DesktopLandingV5 />
      <style jsx global>{`
        .closr-style-route {
          --closr-cream: #f5f0e8;
          --closr-warm-50: #fffff5;
          --closr-warm-100: #fffceb;
          --closr-ink: rgb(26, 26, 26);
          --closr-muted: rgba(26, 26, 26, 0.62);
          background-color: var(--closr-cream) !important;
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif;
          color: var(--closr-ink);
        }

        .closr-style-route > div {
          background-color: var(--closr-cream) !important;
        }

        /* Global section rhythm: cream + warm alternation */
        .closr-style-route section {
          background: var(--closr-cream) !important;
          color: var(--closr-ink) !important;
        }

        .closr-style-route section:nth-of-type(even) {
          background: var(--closr-warm-50) !important;
        }

        .closr-style-route section:nth-of-type(odd) {
          background: var(--closr-cream) !important;
        }

        .closr-style-route h1,
        .closr-style-route h2,
        .closr-style-route h3,
        .closr-style-route h4,
        .closr-style-route h5,
        .closr-style-route h6 {
          font-family: var(--font-serif), 'EB Garamond', Georgia, 'Times New Roman', serif !important;
          color: var(--closr-ink) !important;
          font-weight: 500 !important;
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

        .closr-style-route p,
        .closr-style-route li,
        .closr-style-route label {
          color: var(--closr-muted);
        }

        /* Remove loud decorative overlays globally */
        .closr-style-route section > .absolute.inset-0 {
          display: none !important;
        }

        /* Navbar: light editorial shell */
        .closr-style-route nav {
          background: rgba(245, 240, 232, 0.96) !important;
          border-bottom: 1px solid rgba(26, 26, 26, 0.14) !important;
          backdrop-filter: blur(8px);
        }

        .closr-style-route nav a {
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif !important;
          color: var(--closr-ink) !important;
        }

        /* Hero typography treatment */
        .closr-style-route section:first-of-type h1 {
          color: rgba(26, 26, 26, 0.52) !important;
          font-family: var(--font-serif), 'EB Garamond', Georgia, 'Times New Roman', serif !important;
          font-size: clamp(2.9rem, 6.7vw, 5.8rem) !important;
          line-height: 0.98 !important;
          letter-spacing: -0.03em !important;
        }

        .closr-style-route section:first-of-type h1 span {
          color: var(--closr-ink) !important;
          font-weight: 700 !important;
        }

        .closr-style-route section:first-of-type {
          background: var(--closr-cream) !important;
          min-height: auto !important;
          padding-top: 7.5rem !important;
          padding-bottom: 5rem !important;
        }

        .closr-style-route section:first-of-type p {
          color: var(--closr-muted) !important;
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

        /* Global CTA styling (except nav override above) */
        .closr-style-route a[class*='bg-[#fdcc02]'],
        .closr-style-route a[class*='bg-red-500'] {
          background: hsl(var(--primary)) !important;
          color: #ffffff !important;
          border-radius: 9999px !important;
          border: none !important;
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

        /* Badge / pill style */
        .closr-style-route .inline-flex.rounded-full {
          background: rgba(2, 79, 70, 0.08) !important;
          border: 1px solid rgba(2, 79, 70, 0.18) !important;
          color: hsl(var(--primary)) !important;
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif !important;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        /* Section-level feature links use teal with arrow char */
        .closr-style-route a[href^='/v5/'] {
          color: hsl(var(--primary)) !important;
          text-decoration: none !important;
          font-weight: 600 !important;
        }

        .closr-style-route a[href^='/v5/'] svg {
          display: none !important;
        }

        .closr-style-route a[href^='/v5/']::after {
          content: ' →';
        }

        /* Stamp-card look */
        .closr-style-route [class*='rounded-2xl'][class*='border'],
        .closr-style-route [class*='rounded-xl'][class*='border'] {
          background-color: #ffffff !important;
          border-width: 2px !important;
          border-color: hsl(var(--card-border)) !important;
          border-radius: 0.75rem !important;
          box-shadow: var(--card-shadow) !important;
        }

        /* Kill saturated accent fills */
        .closr-style-route [class*='bg-[#a158ff]'],
        .closr-style-route [class*='bg-[#F4845F]'],
        .closr-style-route [class*='bg-red-'],
        .closr-style-route [class*='bg-[#fdcc02]/'],
        .closr-style-route [class*='bg-[#3DD6C3]/'] {
          background-color: rgba(2, 79, 70, 0.08) !important;
          border-color: rgba(2, 79, 70, 0.18) !important;
        }

        .closr-style-route [class*='text-[#fdcc02]'],
        .closr-style-route [class*='text-[#3DD6C3]'] {
          color: hsl(var(--primary)) !important;
        }

        /* Feature section clean-up: no pink / teal panels */
        .closr-style-route section:nth-of-type(3),
        .closr-style-route section:nth-of-type(4),
        .closr-style-route section:nth-of-type(5) {
          background: var(--closr-cream) !important;
        }

        /* ONE dark section only: Two Surfaces, One System */
        .closr-style-route section:nth-of-type(6) {
          background: rgb(26, 26, 26) !important;
          border-radius: 1rem !important;
          max-width: 72rem;
          margin: 2rem auto !important;
          overflow: hidden;
        }

        .closr-style-route section:nth-of-type(6) h2,
        .closr-style-route section:nth-of-type(6) h3,
        .closr-style-route section:nth-of-type(6) p,
        .closr-style-route section:nth-of-type(6) span {
          color: rgba(255, 255, 235, 0.92) !important;
        }

        .closr-style-route section:nth-of-type(6) [class*='bg-white/[0.04]'],
        .closr-style-route section:nth-of-type(6) [class*='bg-white/[0.03]'],
        .closr-style-route section:nth-of-type(6) [class*='bg-white/[0.08]'] {
          background: rgba(255, 255, 235, 0.09) !important;
          border-color: rgba(255, 255, 235, 0.2) !important;
          box-shadow: none !important;
        }

        /* Calculator section pass */
        .closr-style-route section:nth-of-type(7) {
          background: var(--closr-warm-50) !important;
        }

        .closr-style-route section:nth-of-type(7) .rounded-3xl {
          background: #ffffff !important;
          border: 2px solid hsl(var(--card-border)) !important;
          box-shadow: var(--card-shadow) !important;
          border-radius: 0.75rem !important;
        }

        .closr-style-route section:nth-of-type(7) input[type='text'] {
          background: #f8f6ef !important;
          border: 1px solid rgba(26, 26, 26, 0.18) !important;
          border-radius: 0.75rem !important;
          color: var(--closr-ink) !important;
          font-size: 0.95rem !important;
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif !important;
        }

        .closr-style-route section:nth-of-type(7) input[type='range'] {
          background: linear-gradient(to right, #024f46 0%, #024f46 50%, #e5e7eb 50%, #e5e7eb 100%) !important;
        }

        .closr-style-route section:nth-of-type(7) [class*='from-red-50'] {
          background: #ffffff !important;
          border: 1px solid rgba(26, 26, 26, 0.12) !important;
        }

        /* How-it-works gets soft sage background */
        .closr-style-route section:nth-of-type(9) {
          background: rgb(233, 244, 240) !important;
        }

        .closr-style-route section:nth-of-type(9) [class*='bg-[#0D4D4D]'] {
          background: rgba(2, 79, 70, 0.12) !important;
        }

        /* Pricing section soft sage */
        .closr-style-route section:nth-of-type(11) {
          background: rgb(233, 244, 240) !important;
        }

        .closr-style-route section:nth-of-type(11) [class*='rounded-2xl'] {
          background: #ffffff !important;
          border: 2px solid hsl(var(--card-border)) !important;
          box-shadow: var(--card-shadow) !important;
        }

        /* FAQ clean cards */
        .closr-style-route section:nth-of-type(12) {
          background: var(--closr-cream) !important;
        }

        .closr-style-route section:nth-of-type(12) [class*='rounded-xl'] {
          background: #ffffff !important;
          border: 1px solid rgba(26, 26, 26, 0.12) !important;
          box-shadow: none !important;
        }

        /* Final CTA is calm and light */
        .closr-style-route section:nth-of-type(13) {
          background: var(--closr-warm-100) !important;
        }

        .closr-style-route section:nth-of-type(13) p,
        .closr-style-route section:nth-of-type(13) h2 {
          color: var(--closr-ink) !important;
        }

        /* Footer */
        .closr-style-route footer {
          background: rgb(26, 26, 26) !important;
          border-top-color: rgba(255, 255, 235, 0.15) !important;
        }

        .closr-style-route footer *,
        .closr-style-route footer a {
          color: rgba(255, 255, 235, 0.82) !important;
        }
      `}</style>
    </main>
  );
}
