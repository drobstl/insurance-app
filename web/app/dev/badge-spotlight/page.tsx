import { notFound } from 'next/navigation';
import BadgeSpotlightPreview from './BadgeSpotlightPreview';

// Dev-only preview of the dashboard "Your badges" card + full-screen spotlight.
// 404s in production (mirrors app/dev/frame-preview).
export default function Page() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }
  return <BadgeSpotlightPreview />;
}
