'use client';

import DesktopLandingV5 from '../v5/page';

export default function ClosrStylePage() {
  return (
    <main className="marketing-light closr-style-route min-h-screen bg-background text-foreground">
      <DesktopLandingV5 />
      <style jsx global>{`
        .closr-style-route {
          font-family: var(--font-sans), Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif;
        }

        .closr-style-route h1,
        .closr-style-route h2,
        .closr-style-route h3,
        .closr-style-route h4,
        .closr-style-route h5,
        .closr-style-route h6 {
          font-family: var(--font-serif), 'EB Garamond', Georgia, 'Times New Roman', serif !important;
          color: hsl(var(--foreground)) !important;
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

        /* Convert dark/teal surfaces to warm neutral */
        .closr-style-route [class*='bg-[#0D4D4D]'],
        .closr-style-route [class*='bg-[#070E1B]'],
        .closr-style-route [class*='bg-[#005851]'],
        .closr-style-route [class*='bg-[#1a1a1a]'],
        .closr-style-route section[style*='#0D4D4D'],
        .closr-style-route section[style*='#070E1B'] {
          background: hsl(var(--background)) !important;
          background-color: hsl(var(--background)) !important;
        }

        /* Purple section to lavender-light */
        .closr-style-route [class*='bg-[#a158ff]'] {
          background-color: hsl(var(--lavender-light)) !important;
        }

        /* Force warm text treatment for former white content */
        .closr-style-route [class*='text-white'] {
          color: hsl(var(--foreground)) !important;
        }
        .closr-style-route [class*='text-[#3DD6C3]'],
        .closr-style-route [class*='text-[#fdcc02]'] {
          color: hsl(var(--primary)) !important;
        }

        /* Yellow buttons -> full-pill teal */
        .closr-style-route [class*='bg-[#fdcc02]'] {
          background-color: hsl(var(--primary)) !important;
          color: hsl(var(--primary-foreground)) !important;
          border-radius: 9999px !important;
          border-color: hsl(var(--card-border)) !important;
        }

        /* Card system style */
        .closr-style-route [class*='rounded-2xl'][class*='border'],
        .closr-style-route [class*='rounded-xl'][class*='border'] {
          border-width: 2px !important;
          border-color: hsl(var(--card-border)) !important;
          border-radius: 0.75rem !important;
          box-shadow: var(--card-shadow) !important;
          background-color: hsl(var(--card)) !important;
          color: hsl(var(--card-foreground)) !important;
        }

        .closr-style-route nav,
        .closr-style-route footer {
          background-color: hsl(var(--background)) !important;
          border-color: hsl(var(--border)) !important;
        }
      `}</style>
    </main>
  );
}
