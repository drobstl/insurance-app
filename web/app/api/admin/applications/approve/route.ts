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

    const normalizedEmail = applicantEmail.trim().toLowerCase();
    const firestore = getAdminFirestore();
    const appRef = firestore.collection('foundingMemberApplications').doc(applicationId);

    // Atomic capacity check + approval to prevent last-spot race conditions
    let capacityReached = false;
    await firestore.runTransaction(async (tx) => {
      const approvedSnap = await firestore
        .collection('foundingMemberApplications')
        .where('status', '==', 'approved')
        .get();

      if (approvedSnap.size >= 50) {
        capacityReached = true;
        return;
      }

      tx.update(appRef, { status: 'approved', approvedAt: new Date() });
    });

    if (capacityReached) {
      return NextResponse.json(
        { error: 'Founding tier is full (50/50). Cannot approve more founding members.' },
        { status: 409 }
      );
    }

    // If the applicant already has an account, mark them as a founding member
    let agentsSnapshot = await firestore
      .collection('agents')
      .where('emailLower', '==', normalizedEmail)
      .limit(1)
      .get();

    if (agentsSnapshot.empty) {
      agentsSnapshot = await firestore
        .collection('agents')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
    }

    if (agentsSnapshot.empty) {
      agentsSnapshot = await firestore
        .collection('agents')
        .where('email', '==', applicantEmail)
        .limit(1)
        .get();
    }

    if (!agentsSnapshot.empty) {
      await agentsSnapshot.docs[0].ref.update({
        emailLower: normalizedEmail,
        subscriptionStatus: 'active',
        membershipTier: 'founding',
        isFoundingMember: true,
        foundingMemberApprovedAt: new Date(),
      });
    }

    // Send welcome email via Resend
    const resend = getResend();
    const firstName = applicantName.split(' ')[0];
    await resend.emails.send({
      from: 'Daniel Roberts — AgentForLife™ <support@agentforlife.app>',
      to: normalizedEmail,
      subject: "You're in — Welcome to AgentForLife Founding Members",
      html: `
        <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
          <p style="font-size: 16px;">Hey ${firstName},</p>

          <p style="font-size: 16px;">You're in. Congratulations on being a founding member with free access for life.</p>

          <p style="font-size: 16px;">Here's how to get started:</p>

          <ol style="font-size: 16px; padding-left: 20px;">
            <li style="margin-bottom: 8px;"><strong style="color: #0D4D4D;">Open this on your laptop or desktop.</strong> AgentForLife is a dashboard-first system — your phone won't give you the full experience. Go to <a href="https://agentforlife.app/signup" style="color: #0D4D4D; font-weight: 600;">agentforlife.app/signup</a> and create your account</li>
            <li style="margin-bottom: 8px;"><strong style="color: #0D4D4D;">Important:</strong> Use this same email address (<strong>${normalizedEmail}</strong>) when you sign up so we can match your account</li>
            <li style="margin-bottom: 8px;">You'll be automatically activated as a founding member — no credit card, no checkout</li>
            <li style="margin-bottom: 8px;">Watch the tutorial, set up your profile with your photo, contact info, and business card</li>
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
