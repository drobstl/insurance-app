import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * TEST-ONLY: Sends a holiday card to a client by name.
 *
 * Usage:
 *   GET /api/test/send-holiday-card?clientName=John+Doe&holiday=thanksgiving
 *
 * Searches all agents for a client matching clientName, then writes
 * the holiday notification record and sends the push via Expo.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const clientName = searchParams.get('clientName') || 'John Doe';
  const holiday = searchParams.get('holiday') || 'thanksgiving';

  const HOLIDAY_GREETINGS: Record<string, { title: string; greeting: (first: string, agent: string) => string }> = {
    christmas: {
      title: 'Christmas Greetings',
      greeting: (f, a) => `Merry Christmas, ${f}! Wishing you and your family a season full of warmth, joy, and time together. It\u2019s a privilege to be your agent \u2014 I hope this holiday brings you everything you deserve. \u2014 ${a}`,
    },
    newyear: {
      title: "New Year's Day Greetings",
      greeting: (f, a) => `Happy New Year, ${f}! Here\u2019s to a fresh start and a year full of good things. I\u2019m honored to be the one looking out for you and your family \u2014 let\u2019s make this year a great one. \u2014 ${a}`,
    },
    valentines: {
      title: "Valentine's Day Greetings",
      greeting: (f, a) => `Happy Valentine\u2019s Day, ${f}! Today is all about the people who matter most \u2014 and protecting the ones you love is something I never take lightly. Enjoy every moment with your loved ones today. \u2014 ${a}`,
    },
    july4th: {
      title: 'Independence Day Greetings',
      greeting: (f, a) => `Happy 4th of July, ${f}! Wishing you a day full of good food, great company, and maybe a few fireworks. Enjoy the celebration \u2014 you and your family deserve it. \u2014 ${a}`,
    },
    thanksgiving: {
      title: 'Thanksgiving Greetings',
      greeting: (f, a) => `Happy Thanksgiving, ${f}! I\u2019m grateful for the trust you place in me to protect what matters most to your family. I hope your table is full and your heart is fuller. Enjoy every bite. \u2014 ${a}`,
    },
  };

  const card = HOLIDAY_GREETINGS[holiday];
  if (!card) {
    return NextResponse.json(
      { error: `Invalid holiday: ${holiday}. Must be one of: ${Object.keys(HOLIDAY_GREETINGS).join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const db = getAdminFirestore();
    const agentsSnap = await db.collection('agents').get();

    let foundAgentId: string | null = null;
    let foundClientId: string | null = null;
    let foundClientData: Record<string, unknown> | null = null;
    let agentData: Record<string, unknown> | null = null;

    for (const agentDoc of agentsSnap.docs) {
      const clientsSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('clients')
        .where('name', '==', clientName)
        .limit(1)
        .get();

      if (!clientsSnap.empty) {
        foundAgentId = agentDoc.id;
        foundClientId = clientsSnap.docs[0].id;
        foundClientData = clientsSnap.docs[0].data();
        agentData = agentDoc.data();
        break;
      }
    }

    if (!foundAgentId || !foundClientId || !foundClientData) {
      return NextResponse.json(
        { error: `Client "${clientName}" not found across any agent` },
        { status: 404 },
      );
    }

    const pushToken = foundClientData.pushToken as string | undefined;
    const firstName = clientName.split(' ')[0];
    const agentName = (agentData?.name as string) || 'Your Agent';
    const agencyName = (agentData?.agencyName as string) || '';
    const agentSignature = agencyName ? `${agentName}, ${agencyName}` : agentName;
    const schedulingUrl = (agentData?.schedulingUrl as string) || undefined;

    const body = card.greeting(firstName, agentSignature);

    let pushStatus = 'no_push_token';

    if (pushToken) {
      try {
        const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify({
            to: pushToken,
            title: card.title,
            body,
            sound: 'default',
            data: {
              type: 'holiday',
              holiday,
              agentId: foundAgentId,
              clientId: foundClientId,
              ...(schedulingUrl ? { schedulingUrl, includeBookingLink: true } : {}),
            },
          }),
        });

        const expoResult = await expoResponse.json();
        pushStatus = expoResult?.data?.status === 'ok' ? 'sent' : 'failed';
      } catch (pushErr) {
        console.error('Push send error:', pushErr);
        pushStatus = 'failed';
      }
    }

    const notifRef = db
      .collection('agents')
      .doc(foundAgentId)
      .collection('clients')
      .doc(foundClientId)
      .collection('notifications');

    const docRef = await notifRef.add({
      type: 'holiday',
      holiday,
      title: card.title,
      body,
      includeBookingLink: !!schedulingUrl,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: pushStatus === 'sent' ? 'sent' : pushStatus,
    });

    return NextResponse.json({
      success: true,
      agentId: foundAgentId,
      clientId: foundClientId,
      clientName,
      holiday,
      notificationId: docRef.id,
      pushStatus,
      message: pushStatus === 'sent'
        ? `${card.title} sent to ${clientName} with push notification!`
        : pushStatus === 'no_push_token'
          ? `${card.title} saved for ${clientName} (no push token — card will appear when client opens the app)`
          : `${card.title} saved for ${clientName} (push failed, but card is in Firestore)`,
    });
  } catch (error) {
    console.error('Send holiday card error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
