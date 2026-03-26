import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, reason: 'missing_api_key' }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const distinctId =
      typeof body?.distinct_id === 'string' && body.distinct_id.trim().length > 0
        ? body.distinct_id.trim()
        : `anon-${crypto.randomUUID()}`;
    const path =
      typeof body?.path === 'string' && body.path.startsWith('/')
        ? body.path
        : '/';

    const response = await fetch('https://us.i.posthog.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: 'posthog_client_boot',
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
