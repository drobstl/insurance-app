import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

export async function POST(req: NextRequest) {
  try {
    const { applicantName, applicantEmail } = await req.json();

    if (!applicantName) {
      return NextResponse.json(
        { error: 'Missing applicantName' },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app';

    const resend = getResend();
    await resend.emails.send({
      from: 'AgentForLife Notifications <support@agentforlife.app>',
      to: 'support@agentforlife.app',
      subject: `New Founding Member Application: ${applicantName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; color: #2D3748; line-height: 1.6;">
          <h2 style="color: #0D4D4D; margin-bottom: 16px;">New Application</h2>
          <p style="font-size: 16px;"><strong>${applicantName}</strong>${applicantEmail ? ` (${applicantEmail})` : ''} just applied for the Founding Member program.</p>
          <p style="margin-top: 24px;">
            <a href="${appUrl}/dashboard/admin/applications" style="display: inline-block; padding: 12px 24px; background: #3DD6C3; color: #0D4D4D; text-decoration: none; border-radius: 8px; font-weight: 600;">
              Review Applications →
            </a>
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending notification:', error);
    // Don't fail the user's submission if notification fails
    return NextResponse.json({ success: false, error: 'Notification failed' });
  }
}
