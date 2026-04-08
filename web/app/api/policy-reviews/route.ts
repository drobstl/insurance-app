import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../lib/firebase-admin';

interface SerializableReview {
  id: string;
  clientId: string;
  clientName: string;
  clientFirstName: string;
  policyId: string;
  policyType: string;
  carrier: string;
  premiumAmount: number | null;
  coverageAmount: number | null;
  anniversaryDate: string;
  messageStyle: string;
  status: string;
  conversation: Array<{ role: string; body: string; timestamp: string }>;
  gatheredInfo?: Record<string, unknown>;
  chatId: string | null;
  dripCount: number;
  aiEnabled: boolean;
  createdAt: string | null;
  lastDripAt: string | null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate === 'function') {
      const date = maybe.toDate();
      const ms = date.getTime();
      return Number.isFinite(ms) ? date.toISOString() : null;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const db = getAdminFirestore();
    const snap = await db.collection('agents').doc(agentId).collection('policyReviews').get();

    const reviews: SerializableReview[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const conversationRaw = Array.isArray(data.conversation) ? data.conversation : [];
      const conversation = conversationRaw
        .filter((entry) => typeof entry === 'object' && entry !== null)
        .map((entry) => {
          const e = entry as Record<string, unknown>;
          return {
            role: typeof e.role === 'string' ? e.role : 'agent-ai',
            body: typeof e.body === 'string' ? e.body : '',
            timestamp: toIso(e.timestamp) || new Date().toISOString(),
          };
        });

      return {
        id: d.id,
        clientId: typeof data.clientId === 'string' ? data.clientId : '',
        clientName: typeof data.clientName === 'string' ? data.clientName : 'Client',
        clientFirstName: typeof data.clientFirstName === 'string' ? data.clientFirstName : 'Client',
        policyId: typeof data.policyId === 'string' ? data.policyId : '',
        policyType: typeof data.policyType === 'string' ? data.policyType : 'Policy',
        carrier: typeof data.carrier === 'string' ? data.carrier : '',
        premiumAmount: typeof data.premiumAmount === 'number' ? data.premiumAmount : null,
        coverageAmount: typeof data.coverageAmount === 'number' ? data.coverageAmount : null,
        anniversaryDate: typeof data.anniversaryDate === 'string' ? data.anniversaryDate : '',
        messageStyle: typeof data.messageStyle === 'string' ? data.messageStyle : 'check_in',
        status: typeof data.status === 'string' ? data.status : 'outreach-sent',
        conversation,
        gatheredInfo: typeof data.gatheredInfo === 'object' && data.gatheredInfo !== null
          ? (data.gatheredInfo as Record<string, unknown>)
          : undefined,
        chatId: typeof data.chatId === 'string' ? data.chatId : null,
        dripCount: typeof data.dripCount === 'number' ? data.dripCount : 0,
        aiEnabled: typeof data.aiEnabled === 'boolean' ? data.aiEnabled : true,
        createdAt: toIso(data.createdAt),
        lastDripAt: toIso(data.lastDripAt),
      };
    });

    reviews.sort((a, b) => {
      const bMs = Date.parse(b.createdAt || b.lastDripAt || '') || 0;
      const aMs = Date.parse(a.createdAt || a.lastDripAt || '') || 0;
      return bMs - aMs;
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    console.error('Policy reviews fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

