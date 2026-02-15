import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * Daily cron job: sends a push notification to every client whose birthday
 * is today. Guards against duplicate sends with a `birthdayNotifiedAt` field
 * on the client doc that stores the year (e.g. "2026").
 *
 * Schedule: 0 13 * * * (1 PM UTC — morning across US timezones)
 */

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const now = new Date();
    const todayMonth = now.getUTCMonth() + 1; // 1-indexed
    const todayDay = now.getUTCDate();
    const currentYear = now.getUTCFullYear().toString();

    let totalPushSent = 0;
    let totalSkipped = 0;

    // 1. Iterate all agents
    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentName = (agentData.name as string) || 'Your Agent';
      const agencyName = (agentData.agencyName as string) || '';

      // 2. Iterate each agent's clients
      const clientsSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('clients')
        .get();

      for (const clientDoc of clientsSnap.docs) {
        const clientData = clientDoc.data();
        const pushToken = clientData.pushToken as string | undefined;
        const dateOfBirth = clientData.dateOfBirth as string | undefined;
        const clientName = (clientData.name as string) || 'Friend';

        // Skip if no date of birth or no push token
        if (!dateOfBirth || !pushToken) {
          totalSkipped++;
          continue;
        }

        // Guard against duplicate sends for the current year
        if (clientData.birthdayNotifiedAt === currentYear) continue;

        // 3. Parse the date of birth
        const birthday = parseBirthday(dateOfBirth);
        if (!birthday) continue;

        // 4. Check if today is the client's birthday
        if (birthday.month !== todayMonth || birthday.day !== todayDay) continue;

        // 5. Send push notification via Expo Push API
        const firstName = clientName.split(' ')[0];
        const pushTitle = 'Happy Birthday! 🎂';
        const agentSignature = agencyName
          ? `${agentName}, ${agencyName}`
          : agentName;
        const pushBody = `Happy Birthday, ${firstName}! Today is your day — I hope it's filled with the people and moments that mean the most to you. It's a privilege to be the one looking after your family's protection. Enjoy every minute. — ${agentSignature}`;

        try {
          const expoResponse = await fetch(
            'https://exp.host/--/api/v2/push/send',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Accept-Encoding': 'gzip, deflate',
              },
              body: JSON.stringify({
                to: pushToken,
                title: pushTitle,
                body: pushBody,
                sound: 'default',
                data: {
                  type: 'birthday',
                  agentId: agentDoc.id,
                  clientId: clientDoc.id,
                },
              }),
            }
          );

          const expoResult = await expoResponse.json();
          const pushStatus =
            expoResult?.data?.status === 'ok' ? 'sent' : 'failed';

          if (pushStatus === 'failed') {
            console.error(
              `Expo push error (birthday) for client ${clientDoc.id}:`,
              expoResult?.data?.message || expoResult
            );
          }

          // 6. Write notification record to Firestore
          const notifRef = db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('clients')
            .doc(clientDoc.id)
            .collection('notifications');

          await notifRef.add({
            type: 'birthday',
            title: pushTitle,
            body: pushBody,
            sentAt: FieldValue.serverTimestamp(),
            readAt: null,
            status: pushStatus,
          });

          // 7. Mark client as notified for this year
          await clientDoc.ref.update({
            birthdayNotifiedAt: currentYear,
          });

          if (pushStatus === 'sent') totalPushSent++;
        } catch (pushError) {
          console.error(
            `Failed to send birthday push for client ${clientDoc.id}:`,
            pushError
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      pushNotificationsSent: totalPushSent,
      skipped: totalSkipped,
    });
  } catch (error) {
    console.error('Birthday check cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Date parsing helpers ──────────────────────────────────────────────────────

/**
 * Parses a dateOfBirth string into { month, day }.
 * Supports formats:
 *   - "1990-03-15" (ISO)
 *   - "03/15/1990" (US)
 *   - "March 15, 1990" (long)
 */
function parseBirthday(
  dob: string
): { month: number; day: number } | null {
  // Try ISO format: YYYY-MM-DD
  const isoMatch = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return { month: parseInt(isoMatch[2], 10), day: parseInt(isoMatch[3], 10) };
  }

  // Try US format: MM/DD/YYYY
  const usMatch = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return { month: parseInt(usMatch[1], 10), day: parseInt(usMatch[2], 10) };
  }

  // Try long format: "Month DD, YYYY"
  const longMatch = dob.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i
  );
  if (longMatch) {
    const monthNames: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    return {
      month: monthNames[longMatch[1].toLowerCase()],
      day: parseInt(longMatch[2], 10),
    };
  }

  return null;
}
