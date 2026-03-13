import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../lib/firebase-admin';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminFirestore();
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentRef = db.collection('agents').doc(decoded.uid);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const data = agentSnap.data()!;
    let inviteCode = data.inviteCode as string | undefined;

    if (!inviteCode) {
      let attempts = 0;
      while (attempts < 10) {
        const candidate = generateCode();
        const existing = await db.collection('agentInviteCodes').doc(candidate).get();
        if (!existing.exists) {
          inviteCode = candidate;
          break;
        }
        attempts++;
      }
      if (!inviteCode) return NextResponse.json({ error: 'Could not generate code' }, { status: 500 });

      await db.collection('agentInviteCodes').doc(inviteCode).set({ agentId: decoded.uid });
      await agentRef.update({ inviteCode });
    }

    const referredSnap = await db
      .collection('agents')
      .where('referredByAgent', '==', decoded.uid)
      .get();

    return NextResponse.json({
      inviteCode,
      inviteUrl: `https://agentforlife.app/signup?ref=${inviteCode}`,
      agentsReferred: referredSnap.size,
      referralRewardsGiven: data.referralRewardsGiven ?? 0,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const codeDoc = await db.collection('agentInviteCodes').doc(code.toUpperCase()).get();
    if (!codeDoc.exists) {
      return NextResponse.json({ valid: false });
    }

    const referrerId = codeDoc.data()!.agentId as string;
    const referrerSnap = await db.collection('agents').doc(referrerId).get();
    const referrerName = referrerSnap.exists ? (referrerSnap.data()!.name as string) : null;

    return NextResponse.json({
      valid: true,
      referrerId,
      referrerName,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
