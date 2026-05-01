import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { buildBeneficiaryHolidayMessage, resolveClientLanguage, type HolidayCardKey } from '../../../../lib/client-language';

function getHolidayForDate(date: Date): HolidayCardKey | null {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (month === 0 && day === 1) return 'newyear';
  if (month === 1 && day === 14) return 'valentines';
  if (month === 6 && day === 4) return 'july4th';
  if (month === 10 && date.getUTCDay() === 4 && day >= 22 && day <= 28) return 'thanksgiving';
  if (month === 11 && day === 25) return 'christmas';
  return null;
}

async function sendPushNotification(pushToken: string, title: string, body: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        sound: 'default',
        badge: 1,
        priority: 'high',
        data,
      }),
    });
    const result = await res.json();
    return result?.data?.status === 'ok';
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const holiday = getHolidayForDate(now);
    if (!holiday) {
      return NextResponse.json({ success: true, holiday: null, sent: 0, skipped: 0, failed: 0 });
    }

    const db = getAdminFirestore();
    const nowIso = now.toISOString();
    const year = now.getUTCFullYear();
    const dedupeKey = `${holiday}_${year}`;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    const agentsSnap = await db.collection('agents').get();
    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      if (agentData.beneficiaryHolidayTouchpointsEnabled !== true) continue;
      const maxTouches = Math.min(10, Math.max(1, Number(agentData.beneficiaryMaxTouchesPer30Days || 3)));
      const agentName = (agentData.name as string) || 'Your Agent';
      const agencyName = (agentData.agencyName as string) || '';
      const agentSignature = agencyName ? `${agentName}, ${agencyName}` : agentName;

      const clientsSnap = await db.collection('agents').doc(agentDoc.id).collection('clients').get();
      for (const clientDoc of clientsSnap.docs) {
        const clientData = clientDoc.data();
        const insuredName = (clientData.name as string) || 'your loved one';
        const clientsLang = resolveClientLanguage(clientData.preferredLanguage);

        const policiesSnap = await clientDoc.ref.collection('policies').get();
        for (const policyDoc of policiesSnap.docs) {
          const policyData = policyDoc.data() as Record<string, unknown>;
          const beneficiaries = Array.isArray(policyData.beneficiaries) ? policyData.beneficiaries : [];
          for (const rawBeneficiary of beneficiaries) {
            if (!rawBeneficiary || typeof rawBeneficiary !== 'object') continue;
            const beneficiary = rawBeneficiary as Record<string, unknown>;
            const code = typeof beneficiary.accessCode === 'string' ? beneficiary.accessCode.trim().toUpperCase() : '';
            if (!code) {
              skipped += 1;
              continue;
            }
            if (beneficiary.optOutOutreach === true) {
              skipped += 1;
              continue;
            }
            const holidayDedupeDoc = db
              .collection('agents')
              .doc(agentDoc.id)
              .collection('beneficiaryHolidaySends')
              .doc(`${code}_${dedupeKey}`);
            const alreadySent = await holidayDedupeDoc.get();
            if (alreadySent.exists) {
              skipped += 1;
              continue;
            }

            const eventsSnap = await db
              .collection('agents')
              .doc(agentDoc.id)
              .collection('beneficiaryOutreachByCode')
              .doc(code)
              .collection('events')
              .where('status', '==', 'sent')
              .where('sentAt', '>=', thirtyDaysAgo)
              .get();
            if (eventsSnap.size >= maxTouches) {
              skipped += 1;
              continue;
            }

            const pushToken = typeof clientData.pushToken === 'string' ? clientData.pushToken.trim() : '';
            if (!pushToken) {
              // Holiday beneficiary outreach is now push-only.
              skipped += 1;
              continue;
            }

            const beneficiaryName = typeof beneficiary.name === 'string' ? beneficiary.name.trim() : '';
            const role = beneficiary.type === 'contingent' ? 'contingent' : 'primary';
            const localized = buildBeneficiaryHolidayMessage({
              holiday,
              beneficiaryFirstName: beneficiaryName.split(' ')[0] || 'there',
              insuredFirstName: insuredName.split(' ')[0] || insuredName,
              role,
              agentSignature,
              language: clientsLang,
            });
            try {
              const ok = await sendPushNotification(pushToken, localized.title, localized.body, {
                type: 'beneficiary_holiday',
                agentId: agentDoc.id,
                clientId: clientDoc.id,
                beneficiaryCode: code,
                holiday,
              });
              if (!ok) {
                failed += 1;
                continue;
              }
              await holidayDedupeDoc.set({
                holiday,
                beneficiaryCode: code,
                beneficiaryName,
                policyId: policyDoc.id,
                clientId: clientDoc.id,
                channel: 'push',
                sentAt: nowIso,
              });
              await db
                .collection('agents')
                .doc(agentDoc.id)
                .collection('beneficiaryOutreachByCode')
                .doc(code)
                .collection('events')
                .add({
                  category: 'holiday',
                  campaignType: 'beneficiary_holiday',
                  holiday,
                  channel: 'push',
                  status: 'sent',
                  sentAt: nowIso,
                });
              sent += 1;
            } catch (error) {
              failed += 1;
            }
          }
        }
      }
    }

    console.log('[beneficiary-holiday-check] complete', { holiday, sent, skipped, failed });
    return NextResponse.json({ success: true, holiday, sent, skipped, failed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
