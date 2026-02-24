import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * PATCH /api/auth/update-email
 *
 * Updates the agent's email in both Firebase Auth and Firestore.
 * Requires the agent's current password for verification (handled client-side
 * via re-authentication before calling this endpoint).
 *
 * Body: { newEmail: string }
 * Auth: Bearer <Firebase ID token>
 */
export async function PATCH(req: NextRequest) {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba143b'},body:JSON.stringify({sessionId:'ba143b',location:'update-email/route.ts:PATCH',message:'API handler entered',data:{},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba143b'},body:JSON.stringify({sessionId:'ba143b',location:'update-email/route.ts:PATCH',message:'Token verified',data:{uid},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    const { newEmail } = await req.json();

    if (!newEmail || typeof newEmail !== 'string') {
      return NextResponse.json({ error: 'Missing newEmail' }, { status: 400 });
    }

    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    await adminAuth.updateUser(uid, { email: trimmed });

    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba143b'},body:JSON.stringify({sessionId:'ba143b',location:'update-email/route.ts:PATCH',message:'Auth email updated, updating Firestore',data:{uid,trimmed},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    const db = getAdminFirestore();
    await db.collection('agents').doc(uid).set({ email: trimmed }, { merge: true });

    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba143b'},body:JSON.stringify({sessionId:'ba143b',location:'update-email/route.ts:PATCH',message:'Email update complete',data:{uid,trimmed},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({ success: true, email: trimmed });
  } catch (error: unknown) {
    console.error('Error updating email:', error);

    // #region agent log
    const errObj = error as Record<string, unknown>;
    fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba143b'},body:JSON.stringify({sessionId:'ba143b',location:'update-email/route.ts:PATCH:catch',message:'API caught error',data:{code:errObj?.code,message:errObj?.message,name:errObj?.name,errorString:String(error)},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      return NextResponse.json(
        { error: 'That email is already associated with another account.' },
        { status: 409 },
      );
    }
    if (code === 'auth/invalid-email') {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
  }
}
