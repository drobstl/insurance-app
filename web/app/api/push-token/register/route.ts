import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/push-token/register
 *
 * Called by the mobile app after obtaining an Expo push token.
 * Writes the token to the client document using the Admin SDK,
 * which bypasses Firestore security rules entirely.
 *
 * Body: { clientCode: string, pushToken: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { clientCode, pushToken } = await req.json();

    if (!clientCode || typeof clientCode !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }
    if (!pushToken || typeof pushToken !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid pushToken' }, { status: 400 });
    }

    const normalizedCode = clientCode.trim().toUpperCase();

    const db = getAdminFirestore();
    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const clientsSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('clients')
        .where('clientCode', '==', normalizedCode)
        .limit(1)
        .get();

      if (!clientsSnap.empty) {
        const clientDoc = clientsSnap.docs[0];
        await clientDoc.ref.update({ pushToken });

        // #region agent log
        fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3c0330'},body:JSON.stringify({sessionId:'3c0330',location:'push-token/register:44',message:'Push token saved to agent subcollection',data:{agentId:agentDoc.id,clientId:clientDoc.id,clientCode:normalizedCode,tokenPrefix:pushToken.substring(0,20)},timestamp:Date.now(),hypothesisId:'H4-write-path'})}).catch(()=>{});
        // #endregion

        return NextResponse.json({
          success: true,
          agentId: agentDoc.id,
          clientId: clientDoc.id,
        });
      }
    }

    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3c0330'},body:JSON.stringify({sessionId:'3c0330',location:'push-token/register:56',message:'Client code not found',data:{normalizedCode},timestamp:Date.now(),hypothesisId:'H3-code-mismatch'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
  } catch (error) {
    console.error('push-token/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
