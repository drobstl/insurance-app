import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { Resend } from 'resend';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, clientCount, biggestDifference } = await req.json();

    if (!name || !email || !clientCount || !biggestDifference) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const firestore = getAdminFirestore();
    await firestore.collection('foundingMemberApplications').add({
      name,
      email,
      clientCount,
      biggestDifference,
      timestamp: new Date(),
      status: 'pending',
    });

    // Send notification email to admin (fire-and-forget)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app'}/api/admin/applications/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantName: name, applicantEmail: email }),
    }).catch(() => {});

    // Send confirmation email to applicant (fire-and-forget)
    const resend = getResend();
    if (resend) {
      const firstName = name.split(' ')[0];
      resend.emails.send({
        from: 'Daniel Roberts — AgentForLife <support@agentforlife.app>',
        to: email,
        subject: 'We got your application',
        html: `
          <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
            <p style="font-size: 16px;">Hey ${firstName},</p>

            <p style="font-size: 16px;">Thanks for applying to the AgentForLife Founding Members program. I got your application and I'll personally review it within 24 hours.</p>

            <p style="font-size: 16px;">If you're accepted, I'll send you everything you need to get started — including a promo code for lifetime free access.</p>

            <p style="font-size: 16px;">In the meantime, if you have any questions, just reply to this email.</p>

            <p style="font-size: 16px; margin-top: 32px;">
              — Daniel Roberts<br/>
              <a href="https://agentforlife.app" style="color: #3DD6C3; text-decoration: none;">AgentForLife.app</a>
            </p>
          </div>
        `,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error submitting founding member application:', error);
    return NextResponse.json(
      { error: 'Failed to submit application' },
      { status: 500 }
    );
  }
}
