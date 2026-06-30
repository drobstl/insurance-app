/**
 * Lead-home content fetcher.
 *
 * Pulls the per-agent video manifest + assessment questions from the server
 * (`/api/mobile/lead-content`). The server merges per-agent overrides with
 * platform defaults, so this client just consumes the merged shape.
 *
 * The manifest is small (~1 KB) and rarely changes per agent — fetched once
 * on lead-home mount, no caching beyond the platform HTTP cache.
 */

import { API_BASE } from './api-base';

export interface LeadVideoSlot {
  id?: string;
  title: string;
  url: string;
  durationSec: number;
  thumbnailUrl?: string;
}

export interface LeadAssessmentQuestion {
  id: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
}

export interface LeadHomeContent {
  mainVideo: LeadVideoSlot;
  faqs: LeadVideoSlot[];
  caseStudies: LeadVideoSlot[];
  assessment: LeadAssessmentQuestion[];
}

export async function fetchLeadHomeContent(agentId: string, leadId?: string): Promise<LeadHomeContent> {
  // leadId lets the server read the lead's age and pick an age-appropriate
  // default FAQ video. Optional — omitting it just means no age-targeted FAQ.
  const qs = new URLSearchParams({ agentId });
  if (leadId) qs.set('leadId', leadId);
  const url = `${API_BASE}/api/mobile/lead-content?${qs.toString()}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`lead-content fetch failed (${res.status})`);
  }
  const data = await res.json();
  return {
    mainVideo: {
      title: data.mainVideo?.title || '',
      url: data.mainVideo?.url || '',
      durationSec: typeof data.mainVideo?.durationSec === 'number' ? data.mainVideo.durationSec : 0,
      thumbnailUrl: data.mainVideo?.thumbnailUrl || undefined,
    },
    faqs: Array.isArray(data.faqs)
      ? data.faqs.map((f: { id?: string; title?: string; url?: string; durationSec?: number; thumbnailUrl?: string }) => ({
          id: f.id,
          title: f.title || '',
          url: f.url || '',
          durationSec: typeof f.durationSec === 'number' ? f.durationSec : 0,
          thumbnailUrl: f.thumbnailUrl || undefined,
        }))
      : [],
    caseStudies: Array.isArray(data.caseStudies)
      ? data.caseStudies.map((c: { id?: string; title?: string; url?: string; durationSec?: number; thumbnailUrl?: string }) => ({
          id: c.id,
          title: c.title || '',
          url: c.url || '',
          durationSec: typeof c.durationSec === 'number' ? c.durationSec : 0,
          thumbnailUrl: c.thumbnailUrl || undefined,
        }))
      : [],
    assessment: Array.isArray(data.assessment)
      ? data.assessment.map((q: { id: string; prompt: string; choices: Array<{ id: string; label: string }> }) => ({
          id: q.id,
          prompt: q.prompt,
          choices: Array.isArray(q.choices) ? q.choices : [],
        }))
      : [],
  };
}

export async function submitLeadAssessment(
  leadCode: string,
  answers: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/mobile/lead-assessment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadCode, answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `submit failed (${res.status})`);
  }
}
