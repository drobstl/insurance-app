import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../../lib/firebase-admin';
import { Resend } from 'resend';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

export async function POST(req: NextRequest) {
  try {
    const { applicationId, applicantName, applicantEmail } = await req.json();

    if (!applicationId || !applicantName || !applicantEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Update Firestore status to approved
    const firestore = getAdminFirestore();
    await firestore
      .collection('foundingMemberApplications')
      .doc(applicationId)
      .update({
        status: 'approved',
        approvedAt: new Date(),
      });

    // Send welcome email via Resend
    const resend = getResend();
    const firstName = applicantName.split(' ')[0];
    await resend.emails.send({
      from: 'Daniel Roberts — AgentForLife <support@agentforlife.app>',
      to: applicantEmail,
      subject: "You're in — Welcome to AgentForLife Founding Members",
      html: `
        <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
          <p style="font-size: 16px;">Hey ${firstName},</p>

          <p style="font-size: 16px;">You're in. Congratulations on being a founding member with free access for life.</p>

          <p style="font-size: 16px;">Here's how to get started:</p>

          <ol style="font-size: 16px; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Go to <a href="https://agentforlife.app/signup" style="color: #0D4D4D; font-weight: 600;">agentforlife.app/signup</a> and create your account</li>
            <li style="margin-bottom: 8px;">At checkout, enter this promo code: <strong style="color: #0D4D4D; background: #E6FAF7; padding: 2px 8px; border-radius: 4px; font-size: 18px;">FOUNDER</strong></li>
            <li style="margin-bottom: 8px;">That makes it free — your card won't be charged</li>
            <li style="margin-bottom: 8px;">Watch the tutorial, set up your profile with your photo, contact info, and branding</li>
            <li style="margin-bottom: 8px;">Add a few real clients and have them download the app</li>
          </ol>

          <p style="font-size: 16px;">Once you're in the dashboard, you'll see a <strong>Feedback</strong> tab. That's where I'll ask you some quick questions every week. Be honest — that's what I need.</p>

          <p style="font-size: 16px;">Any questions, reply to this email. No support tickets, no runaround. Just me.</p>

          <p style="font-size: 16px; margin-top: 32px;">
            — Daniel Roberts,<br/>
            <a href="https://agentforlife.app" style="color: #3DD6C3; text-decoration: none;">AgentForLife.app</a>
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error approving application:', error);
    return NextResponse.json(
      { error: 'Failed to approve application' },
      { status: 500 }
    );
  }
}
