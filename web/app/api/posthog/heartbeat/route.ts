import { NextRequest, NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '../../../../lib/analytics-events';

export async function POST(req: NextRequest) {
  try {
    // .trim() matches web/lib/posthog.ts — a trailing newline in the
    // Vercel env value made PostHog 200-and-drop everything (Mar–Jun 2026).
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, reason: 'missing_api_key' }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const distinctId =
      typeof body?.distinct_id === 'string' && body.distinct_id.trim().length > 0
        ? body.distinct_id.trim()
        : null;
    // No minted fallback id — a random distinct_id becomes an orphan person
    // in PostHog that never merges with the agent. The client always sends
    // its posthog-js distinct_id.
    if (!distinctId) {
      return NextResponse.json({ ok: false, reason: 'missing_distinct_id' }, { status: 200 });
    }
    const path =
      typeof body?.path === 'string' && body.path.startsWith('/')
        ? body.path
        : '/';

    const response = await fetch('https://us.i.posthog.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: ANALYTICS_EVENTS.POSTHOG_SERVER_HEARTBEAT,
        distinct_id: distinctId,
        properties: {
          source: 'agentforlife_web',
          path,
        },
      }),
      cache: 'no-store',
    });

    const upstreamBody = await response.text().catch(() => '');
    return NextResponse.json({
      ok: response.ok,
      upstreamStatus: response.status,
      upstreamBody,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
