import { notFound } from 'next/navigation';
import FramePreviewClient from './FramePreviewClient';

export default function FramePreviewPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return <FramePreviewClient />;
}
