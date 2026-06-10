import React from 'react';
import { Timestamp } from 'firebase/firestore';
import { getNextAnniversary as getNextAnniversaryFromDate } from './anniversary-date';

/**
 * Resolve the effective "policy start" date from the explicit `effectiveDate`
 * (preferred) or `createdAt` (fallback). Shared by anniversary math.
 */
const resolvePolicyStartDate = (
  createdAt: Timestamp | { seconds: number; nanoseconds: number } | undefined,
  effectiveDate?: string,
): Date | null => {
  if (effectiveDate) {
    const parsed = new Date(effectiveDate + 'T00:00:00');
    if (!isNaN(parsed.getTime())) return parsed;
  }
  if (!createdAt) return null;
  return createdAt instanceof Timestamp
    ? createdAt.toDate()
    : new Date(createdAt.seconds * 1000);
};

/**
 * Compute the next upcoming anniversary for a policy, plus the anniversary
 * year N (1 = first anniversary, 2 = second, ...). Delegates to the
 * pure-date implementation in `anniversary-date.ts` after resolving the
 * policy's start date from its effective/created fields.
 *
 * Returns null when the policy has no resolvable start date.
 */
export const getNextAnniversary = (
  createdAt: Timestamp | { seconds: number; nanoseconds: number } | undefined,
  effectiveDate?: string,
): { date: Date; year: number } | null => {
  const start = resolvePolicyStartDate(createdAt, effectiveDate);
  if (!start) return null;
  return getNextAnniversaryFromDate(start);
};

/**
 * Check whether a policy is within the anniversary display window (0–30 days
 * before its next annual anniversary). Used by dashboard/UI counters and
 * badges. Client outreach is sent the day after the anniversary.
 *
 * Returns `null` if not in window, or the anniversary Date if it is.
 */
export const getAnniversaryDate = (
  createdAt: Timestamp | { seconds: number; nanoseconds: number } | undefined,
  effectiveDate?: string,
): Date | null => {
  const next = getNextAnniversary(createdAt, effectiveDate);
  if (!next) return null;

  const now = new Date();
  const daysUntil = (next.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil >= 0 && daysUntil <= 30) {
    return next.date;
  }
  return null;
};

/** Human-readable "X days" until the anniversary. */
export const daysUntilAnniversary = (anniversary: Date): number => {
  const now = new Date();
  return Math.ceil((anniversary.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Upcoming anniversary eligibility for UI counters/badges.
 *
 * Annual cadence: a Year-1 review must not permanently hide the Year-2
 * badge. Callers pass a map of `policyId → max anniversaryYear seen in any
 * existing policyReviews campaign doc`. We hide the badge only when that
 * stored year is ≥ the *upcoming* anniversary year — i.e. a campaign already
 * exists for this year's cycle. Older campaigns (lower year) are ignored.
 *
 * For campaign docs missing the `anniversaryYear` field (pre-annual rollout),
 * callers should treat that as `1`.
 */
export const getUpcomingAnniversaryIfEligible = (params: {
  policyId?: string;
  createdAt: Timestamp | { seconds: number; nanoseconds: number } | undefined;
  effectiveDate?: string;
  startedPolicyReviewYearByPolicyId: Map<string, number>;
}): Date | null => {
  const next = getNextAnniversary(params.createdAt, params.effectiveDate);
  if (!next) return null;

  const now = new Date();
  const daysUntil = (next.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0 || daysUntil > 30) return null;

  if (params.policyId) {
    const startedYear = params.startedPolicyReviewYearByPolicyId.get(params.policyId);
    if (startedYear !== undefined && startedYear >= next.year) return null;
  }
  return next.date;
};

/**
 * Returns the number of days since the policy was created.
 * Returns null if createdAt is missing.
 */
export const getPolicyAgeDays = (
  createdAt: Timestamp | { seconds: number; nanoseconds: number } | undefined,
  effectiveDate?: string,
): number | null => {
  let created: Date | null = null;

  if (effectiveDate) {
    const parsed = new Date(effectiveDate + 'T00:00:00');
    if (!isNaN(parsed.getTime())) created = parsed;
  }

  if (!created) {
    if (!createdAt) return null;
    created =
      createdAt instanceof Timestamp
        ? createdAt.toDate()
        : new Date(createdAt.seconds * 1000);
  }

  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * A policy written less than 365 days ago is a chargeback risk
 * if it lapses or is canceled.
 */
export const isChargebackRisk = (policyAgeDays: number | null): boolean => {
  if (policyAgeDays === null) return false;
  return policyAgeDays < 365;
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (dateString: string) => {
  // Parse date parts directly to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateLong = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active':
      return 'bg-[#44bbaa]/20 text-[#005851] border-[#45bcaa]/30';
    case 'Pending':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'Lapsed':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'Declined':
      // Denied / withdrawn application — kept as history, excluded from
      // the book. Muted grey so it reads as "not in force".
      return 'bg-gray-200/70 text-gray-600 border-gray-400/40';
    default:
      return 'bg-gray-200/50 text-gray-500 border-gray-300/50';
  }
};

export const getPolicyTypeIcon = (type: string) => {
  switch (type) {
    case 'IUL':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    case 'Term Life':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'Whole Life':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case 'Mortgage Protection':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'Accidental':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
  }
};
