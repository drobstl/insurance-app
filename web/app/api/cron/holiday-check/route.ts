import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * Daily cron job: on US holidays, sends a personalized push notification to
 * every client of every agent. Guards against duplicate sends with a
 * `holidayNotifiedAt` map on each client doc (e.g. { "christmas_2025": true }).
 *
 * Schedule: 0 14 * * * (2 PM UTC — morning across US timezones)
 */

// ── Holiday calendar ──────────────────────────────────────────────────────────

interface Holiday {
  /** Machine-readable identifier used in Firestore and notification data */
  id: string;
  /** Human-readable name for the notification title */
  name: string;
  /** Greeting template — {firstName} and {agentName} and {agencyName} are replaced */
  greeting: string;
  /** Returns true if `date` (in UTC) falls on this holiday */
  matches: (date: Date) => boolean;
}

const US_HOLIDAYS: Holiday[] = [
  {
    id: 'newyear',
    name: "New Year's Day",
    greeting:
      "Happy New Year, {firstName}! Here's to a fresh start and a year full of good things. I'm honored to be the one looking out for you and your family — let's make this year a great one. — {agentSignature}",
    matches: (d) => d.getUTCMonth() === 0 && d.getUTCDate() === 1,
  },
  {
    id: 'valentines',
    name: "Valentine's Day",
    greeting:
      "Happy Valentine's Day, {firstName}! Today is all about the people who matter most — and protecting the ones you love is something I never take lightly. Enjoy every moment with your loved ones today. — {agentSignature}",
    matches: (d) => d.getUTCMonth() === 1 && d.getUTCDate() === 14,
  },
  {
    id: 'july4th',
    name: 'Independence Day',
    greeting:
      "Happy 4th of July, {firstName}! Wishing you a day full of good food, great company, and maybe a few fireworks. Enjoy the celebration — you and your family deserve it. — {agentSignature}",
    matches: (d) => d.getUTCMonth() === 6 && d.getUTCDate() === 4,
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    greeting:
      "Happy Thanksgiving, {firstName}! I'm grateful for the trust you place in me to protect what matters most to your family. I hope your table is full and your heart is fuller. Enjoy every bite. — {agentSignature}",
    matches: (d) => {
      // 4th Thursday of November
      if (d.getUTCMonth() !== 10) return false; // November = 10
      if (d.getUTCDay() !== 4) return false; // Thursday = 4
      const dayOfMonth = d.getUTCDate();
      return dayOfMonth >= 22 && dayOfMonth <= 28; // 4th occurrence
    },
  },
  {
    id: 'christmas',
    name: 'Christmas',
    greeting:
      "Merry Christmas, {firstName}! Wishing you and your family a season full of warmth, joy, and time together. It's a privilege to be your agent — I hope this holiday brings you everything you deserve. — {agentSignature}",
    matches: (d) => d.getUTCMonth() === 11 && d.getUTCDate() === 25,
  },
];

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // 1. Determine which holiday (if any) is today
    const todaysHoliday = US_HOLIDAYS.find((h) => h.matches(now));
    if (!todaysHoliday) {
      return NextResponse.json({
        success: true,
        holiday: null,
        message: 'No holiday today',
        pushNotificationsSent: 0,
      });
    }

    const currentYear = now.getUTCFullYear();
    const dedupeKey = `${todaysHoliday.id}_${currentYear}`;

    const db = getAdminFirestore();
    let totalPushSent = 0;
    let totalSkipped = 0;

    // 2. Iterate all agents
    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();

      // Skip agents who have opted out of automated holiday cards.
      // Default is opted-in (field absent or true).
      if (agentData.autoHolidayCards === false) continue;

      const agentName = (agentData.name as string) || 'Your Agent';
      const agencyName = (agentData.agencyName as string) || '';
      const agentSignature = agencyName
        ? `${agentName}, ${agencyName}`
        : agentName;

      // 3. Iterate each agent's clients
      const clientsSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('clients')
        .get();

      for (const clientDoc of clientsSnap.docs) {
        const clientData = clientDoc.data();
        const pushToken = clientData.pushToken as string | undefined;
        const clientName = (clientData.name as string) || 'Friend';

        if (!pushToken) {
          totalSkipped++;
          continue;
        }

        // 4. Guard against duplicate sends
        const holidayNotifiedAt =
          (clientData.holidayNotifiedAt as Record<string, boolean>) || {};
        if (holidayNotifiedAt[dedupeKey]) continue;

        // 5. Build personalized notification
        const firstName = clientName.split(' ')[0];
        const pushTitle = `${todaysHoliday.name} Greetings`;
        const pushBody = todaysHoliday.greeting
          .replace('{firstName}', firstName)
          .replace('{agentSignature}', agentSignature);

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
                  type: 'holiday',
                  holiday: todaysHoliday.id,
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
              `Expo push error (holiday) for client ${clientDoc.id}:`,
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
            type: 'holiday',
            holiday: todaysHoliday.id,
            title: pushTitle,
            body: pushBody,
            sentAt: FieldValue.serverTimestamp(),
            readAt: null,
            status: pushStatus,
          });

          // 7. Mark client as notified for this holiday + year
          await clientDoc.ref.update({
            [`holidayNotifiedAt.${dedupeKey}`]: true,
          });

          if (pushStatus === 'sent') totalPushSent++;
        } catch (pushError) {
          console.error(
            `Failed to send holiday push for client ${clientDoc.id}:`,
            pushError
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      holiday: todaysHoliday.id,
      pushNotificationsSent: totalPushSent,
      skipped: totalSkipped,
    });
  } catch (error) {
    console.error('Holiday check cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
