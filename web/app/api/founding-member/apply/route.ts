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
    const {
      name,
      email,
      clientCount,
      biggestDifference,
      policiesLast12Months,
      isCurrentlyBuilding,
      downlineAgentCount,
    } = await req.json();

    if (!name || !email || !clientCount || !biggestDifference) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!policiesLast12Months || !isCurrentlyBuilding) {
      return NextResponse.json(
        { error: 'Missing required fields: policies written and building status' },
        { status: 400 }
      );
    }

    if (isCurrentlyBuilding === 'yes' && !downlineAgentCount) {
      return NextResponse.json(
        { error: 'Downline agent count is required when currently building' },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const firestore = getAdminFirestore();

    // Capacity check — reject if founding tier is full
    const approvedSnap = await firestore
      .collection('foundingMemberApplications')
      .where('status', '==', 'approved')
      .get();
    if (approvedSnap.size >= 50) {
      return NextResponse.json(
        { error: 'founding_full', message: 'All 50 founding member spots have been filled.' },
        { status: 409 }
      );
    }

    await firestore.collection('foundingMemberApplications').add({
      name,
      email: normalizedEmail,
      emailLower: normalizedEmail,
      clientCount,
      biggestDifference,
      policiesLast12Months,
      isCurrentlyBuilding,
      downlineAgentCount: isCurrentlyBuilding === 'yes' ? downlineAgentCount : '',
      timestamp: new Date(),
      status: 'pending',
    });

    // Send notification email to admin (fire-and-forget)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app'}/api/admin/applications/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantName: name, applicantEmail: normalizedEmail }),
    }).catch(() => {});

    // Send confirmation email to applicant
    const resend = getResend();
    if (resend) {
      const firstName = name.split(' ')[0];
      try {
        await resend.emails.send({
          from: 'Daniel Roberts — AgentForLife™ <support@agentforlife.app>',
          to: normalizedEmail,
          subject: 'We got your application',
          html: `
            <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2D3748; line-height: 1.7;">
              <p style="font-size: 16px;">Hey ${firstName},</p>

              <p style="font-size: 16px;">Thanks for applying to the AgentForLife Founding Members program. I got your application and I'll personally review it within 24 hours.</p>

              <p style="font-size: 16px;">If you're accepted, I'll send you everything you need to get started — just create your account and you're in. No credit card required.</p>

              <div style="margin: 32px 0; padding: 24px; background: #F8F9FA; border-radius: 12px; border-left: 3px solid #3DD6C3;">
                <p style="font-size: 18px; font-weight: 700; color: #0D4D4D; margin: 0 0 16px 0;">What I'm Asking From You</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 12px 8px 0; vertical-align: top; font-size: 20px; width: 36px;">🏢</td>
                    <td style="padding: 8px 0; font-size: 15px; color: #2D3748;">Use it with real clients — not just a test account</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px 8px 0; vertical-align: top; font-size: 20px; width: 36px;">📝</td>
                    <td style="padding: 8px 0; font-size: 15px; color: #2D3748;">Give honest feedback weekly — what's broken, what's missing, no sugarcoating. Takes 2 minutes in-app.</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 12px 8px 0; vertical-align: top; font-size: 20px; width: 36px;">📅</td>
                    <td style="padding: 8px 0; font-size: 15px; color: #2D3748;">Commit for 60 days</td>
                  </tr>
                </table>
              </div>

              <p style="font-size: 16px;">In the meantime, if you have any questions, just reply to this email.</p>

              <p style="font-size: 16px; margin-top: 32px;">
                — Daniel Roberts<br/>
                <a href="https://agentforlife.app" style="color: #3DD6C3; text-decoration: none;">AgentForLife.app</a>
              </p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Error sending confirmation email:', emailErr);
      }
    } else {
      console.error('Resend not configured — RESEND_API_KEY missing');
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
