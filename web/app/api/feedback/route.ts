import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      agentName,
      agentEmail,
      feedbackType,
      question,
      response,
      rating,
      issueType,
      screenshotUrl,
    } = body;

    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Google Sheets webhook URL is not configured.' },
        { status: 500 },
      );
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        agentName: agentName ?? '',
        agentEmail: agentEmail ?? '',
        feedbackType: feedbackType ?? '',
        question: question ?? '',
        response: response ?? '',
        rating: rating ?? '',
        issueType: issueType ?? '',
        screenshotUrl: screenshotUrl ?? '',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Sheets webhook failed: ${text}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Feedback API error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to submit feedback';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
