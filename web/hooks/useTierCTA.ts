'use client';

import { useState, useEffect } from 'react';

export interface TierInfo {
  id: string;
  name: string;
  total: number;
  status: 'open' | 'full' | 'upcoming';
  spotsFilled: number;
  spotsRemaining: number;
}

export interface TierCTAData {
  activeTier: 'founding' | 'charter' | 'inner_circle' | 'standard';
  activeTierName: string;
  spotsRemaining: number | null;
  tiers: TierInfo[];
  filledTiers: TierInfo[];
  isFoundingOpen: boolean;
  loaded: boolean;

  ctaHref: string;
  ctaMobileHref: string;
  ctaText: string;
  ctaSubtext: string;
  bannerText: string;
  tickerText: string;
  tierName: string;
  tierPrice: string;
}

const TIER_COPY: Record<string, { price: string; ctaText: string; period: string }> = {
  founding: { price: '$0', ctaText: 'Claim Free Spot', period: 'forever' },
  charter: { price: '$25', ctaText: 'Lock In $25/mo For Life', period: '/mo' },
  inner_circle: { price: '$35', ctaText: 'Lock In $35/mo For Life', period: '/mo' },
  standard: { price: '$49', ctaText: 'Get Started', period: '/mo' },
};

const TIER_NAMES: Record<string, string> = {
  founding: 'Founding Members',
  charter: 'Charter Members',
  inner_circle: 'Inner Circle',
  standard: 'Standard',
};

function buildBannerText(activeTier: string, spotsRemaining: number, filledTiers: TierInfo[]): string {
  if (activeTier === 'founding') {
    return `Only ${spotsRemaining} of 50 free lifetime spots remaining`;
  }
  const missedParts = filledTiers
    .map((t) => (t.id === 'founding' ? 'Free tier' : `$${t.id === 'charter' ? '25' : '35'}/mo tier`))
    .join(' + ');
  if (activeTier === 'charter') {
    return `${missedParts} is full. ${spotsRemaining} Charter spots left — $25/mo locked in for life`;
  }
  if (activeTier === 'inner_circle') {
    return `${missedParts} are full. ${spotsRemaining} Inner Circle spots left — $35/mo for life`;
  }
  return 'All early-bird tiers are full. Standard pricing: $49/mo';
}

function buildTickerText(activeTier: string, spotsRemaining: number): string {
  if (activeTier === 'founding') {
    return `🚀 ${spotsRemaining} FREE SPOTS • LIFETIME FREE • APPLY NOW • 🚀 ${spotsRemaining} FREE SPOTS • LIFETIME FREE • APPLY NOW • `;
  }
  if (activeTier === 'charter') {
    return `🔥 FREE TIER FULL • ${spotsRemaining} CHARTER SPOTS • $25/MO LOCKED FOR LIFE • 🔥 FREE TIER FULL • ${spotsRemaining} CHARTER SPOTS • $25/MO LOCKED FOR LIFE • `;
  }
  if (activeTier === 'inner_circle') {
    return `⚡ 2 TIERS FULL • ${spotsRemaining} INNER CIRCLE SPOTS • $35/MO FOR LIFE • ⚡ 2 TIERS FULL • ${spotsRemaining} INNER CIRCLE SPOTS • $35/MO FOR LIFE • `;
  }
  return 'AGENT FOR LIFE • CLIENT RETENTION SYSTEM • GET STARTED • AGENT FOR LIFE • CLIENT RETENTION SYSTEM • GET STARTED • ';
}

function buildSubtext(activeTier: string, spotsRemaining: number): string {
  if (activeTier === 'founding') {
    return `${spotsRemaining} spots left · $0 forever · No credit card`;
  }
  if (activeTier === 'charter') {
    return `${spotsRemaining} Charter spots left · $25/mo locked in for life`;
  }
  if (activeTier === 'inner_circle') {
    return `${spotsRemaining} Inner Circle spots left · $35/mo for life`;
  }
  return '$49/mo · Cancel anytime';
}

export function useTierCTA(): TierCTAData {
  const [data, setData] = useState<{
    activeTier: string;
    activeTierName: string;
    spotsRemaining: number;
    tiers: TierInfo[];
  } | null>(null);

  useEffect(() => {
    fetch('/api/spots-remaining')
      .then((r) => r.json())
      .then((d) => {
        if (d.activeTier) setData(d);
      })
      .catch(() => {});
  }, []);

  const activeTier = (data?.activeTier ?? 'founding') as TierCTAData['activeTier'];
  const spotsRemaining = data?.spotsRemaining ?? null;
  const spots = spotsRemaining ?? 50;
  const tiers = data?.tiers ?? [];
  const filledTiers = tiers.filter((t) => t.status === 'full');
  const isFoundingOpen = activeTier === 'founding';
  const copy = TIER_COPY[activeTier] ?? TIER_COPY.standard;

  return {
    activeTier,
    activeTierName: data?.activeTierName ?? TIER_NAMES[activeTier],
    spotsRemaining,
    tiers,
    filledTiers,
    isFoundingOpen,
    loaded: data !== null,

    ctaHref: isFoundingOpen ? '/founding-member' : '/signup',
    ctaMobileHref: isFoundingOpen ? '/founding-member/m' : '/signup',
    ctaText: copy.ctaText,
    ctaSubtext: buildSubtext(activeTier, spots),
    bannerText: buildBannerText(activeTier, spots, filledTiers),
    tickerText: buildTickerText(activeTier, spots),
    tierName: TIER_NAMES[activeTier] ?? 'Standard',
    tierPrice: copy.price,
  };
}
