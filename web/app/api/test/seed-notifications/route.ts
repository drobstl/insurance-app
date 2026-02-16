import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * TEST-ONLY route: seeds one notification of each type into Firestore
 * so the mobile app can render them.
 *
 * Usage:
 *   GET /api/test/seed-notifications?agentId=XXX&clientId=YYY
 *
 * Pass &clientName=John to personalise greetings (default: "Friend").
 * Pass &clear=true to delete all existing unread notifications first.
 *
 * ⚠️  Remove this route before shipping to production.
 */
export async function GET(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  const clientId = searchParams.get('clientId');
  const clientName = searchParams.get('clientName') || 'Friend';
  const clear = searchParams.get('clear') === 'true';
  const clearOnly = searchParams.get('clearOnly') === 'true';

  if (!agentId || !clientId) {
    return NextResponse.json(
      { error: 'Missing required query params: agentId, clientId' },
      { status: 400 },
    );
  }

  const db = getAdminFirestore();
  const notifCol = db
    .collection('agents')
    .doc(agentId)
    .collection('clients')
    .doc(clientId)
    .collection('notifications');

  // Optionally clear existing notifications (all, not just unread)
  if (clear || clearOnly) {
    const existing = await notifCol.get();
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (clearOnly) {
      return NextResponse.json({
        success: true,
        message: `Cleared all ${existing.size} notifications`,
      });
    }
  }

  // Seed one notification of each type
  const seeds = [
    {
      type: 'message',
      title: 'Message from Your Agent',
      body: `Hi ${clientName}, just checking in to see how everything is going. Let me know if you have any questions about your coverage!`,
      includeBookingLink: true,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
    {
      type: 'anniversary',
      title: 'Policy Check-In',
      body: `Hi ${clientName}, it's been almost a year since we set up your Term Life policy. A lot can change in a year — I'd love to make sure your coverage still fits your life.`,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
    {
      type: 'holiday',
      holiday: 'christmas',
      title: 'Christmas Greetings',
      body: `Merry Christmas, ${clientName}! Wishing you and your family a season full of warmth, joy, and time together. It's a privilege to be your agent — I hope this holiday brings you everything you deserve.`,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
    {
      type: 'holiday',
      holiday: 'july4th',
      title: 'Independence Day Greetings',
      body: `Happy 4th of July, ${clientName}! Wishing you a day full of good food, great company, and maybe a few fireworks. Enjoy the celebration — you and your family deserve it.`,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
    {
      type: 'holiday',
      holiday: 'thanksgiving',
      title: 'Thanksgiving Greetings',
      body: `Happy Thanksgiving, ${clientName}! I'm grateful for the trust you place in me to protect what matters most to your family. I hope your table is full and your heart is fuller. Enjoy every bite.`,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
    {
      type: 'holiday',
      holiday: 'newyear',
      title: "New Year's Day Greetings",
      body: `Happy New Year, ${clientName}! Here's to a fresh start and a year full of good things. I'm honored to be the one looking out for you and your family — let's make this year a great one.`,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
    {
      type: 'holiday',
      holiday: 'valentines',
      title: "Valentine's Day Greetings",
      body: `Happy Valentine's Day, ${clientName}! Today is all about the people who matter most — and protecting the ones you love is something I never take lightly. Enjoy every moment with your loved ones today.`,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
    {
      type: 'birthday',
      title: 'Happy Birthday! 🎂',
      body: `Happy Birthday, ${clientName}! Today is your day — I hope it's filled with the people and moments that mean the most to you. It's a privilege to be the one looking after your family's protection. Enjoy every minute.`,
      sentAt: FieldValue.serverTimestamp(),
      readAt: null,
      status: 'sent',
    },
  ];

  const ids: string[] = [];
  for (const seed of seeds) {
    const ref = await notifCol.add(seed);
    ids.push(ref.id);
  }

  return NextResponse.json({
    success: true,
    message: `Seeded ${seeds.length} test notifications`,
    notificationIds: ids,
    types: seeds.map((s) => (s as Record<string, unknown>).holiday ?? s.type),
  });
}
