'use client';

import { useState } from 'react';
import {
  OnboardingWalkthroughModal,
  OnboardingWalkthroughPoster,
  WALKTHROUGH_URLS,
  type WalkthroughKey,
} from './OnboardingWalkthroughEmbed';

/**
 * A drop-in "watch how it works" video for a feature's empty state. Renders the
 * clickable poster (auto-thumbnail from the Loom URL, or a "coming soon" state
 * until one is recorded) and owns its own modal, so an empty state only needs a
 * single line — no per-page modal state or wiring.
 *
 * The actual URL is resolved from WALKTHROUGH_URLS[walkthrough], which is fed by
 * a NEXT_PUBLIC_*_WALKTHROUGH_LOOM_URL env var. Unset → poster shows the
 * placeholder label and the modal shows "recording in progress".
 */
export function FeatureWalkthrough({
  walkthrough,
  label = 'Watch how it works',
  placeholderLabel = 'Walkthrough coming soon',
  modalTitle,
  modalSubtitle,
  aspectPercent,
}: {
  walkthrough: WalkthroughKey;
  label?: string;
  placeholderLabel?: string;
  modalTitle: string;
  modalSubtitle?: string;
  aspectPercent?: number;
}) {
  const [open, setOpen] = useState(false);
  const videoUrl = WALKTHROUGH_URLS[walkthrough];

  return (
    <>
      <OnboardingWalkthroughPoster
        onClick={() => setOpen(true)}
        videoUrl={videoUrl}
        label={label}
        placeholderLabel={placeholderLabel}
        aspectPercent={aspectPercent}
      />
      <OnboardingWalkthroughModal
        open={open}
        onClose={() => setOpen(false)}
        videoUrl={videoUrl}
        title={modalTitle}
        subtitle={modalSubtitle}
      />
    </>
  );
}
