import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { createChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * POST /api/agent-invite/sms
 *
 * Sends an SMS to the authenticated agent's phone number with their invite link.
 * Used when the agent adds their phone for the first time in settings.
 *
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(decoded.uid);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const data = agentSnap.data()!;
    const rawPhone = data.phoneNumber as string | undefined;
    if (!rawPhone?.trim()) {
      return NextResponse.json(
        { error: 'No phone number on profile. Save your phone in Settings first.' },
        { status: 400 },
      );
    }

    const normalized = normalizePhone(rawPhone);
    if (!isValidE164(normalized)) {
      return NextResponse.json(
        { error: 'Invalid phone number format.' },
        { status: 422 },
      );
    }

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
      if (!inviteCode) {
        return NextResponse.json({ error: 'Could not generate invite code' }, { status: 500 });
      }
      await db.collection('agentInviteCodes').doc(inviteCode).set({ agentId: decoded.uid });
      await agentRef.update({ inviteCode });
    }

    const inviteUrl = `https://agentforlife.app/signup?ref=${inviteCode}`;
    const message = `Your AgentForLife invite link (share with other agents — you both get 1 month free): ${inviteUrl}`;

    await createChat({ to: normalized, text: message });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Firebase ID token') || msg.includes('decode')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[agent-invite/sms]', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
