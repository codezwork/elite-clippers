import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const { clipId } = await req.json();

    if (!clipId) {
      return NextResponse.json({ error: 'Missing clipId' }, { status: 400 });
    }

    const scheduleRef = adminDb.collection('users').doc(uid).collection('scheduled_orders');
    const snapshot = await scheduleRef
      .where('videoId', '==', clipId)
      .where('status', '==', 'pending')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { status: 'cancelled' });
    });

    await batch.commit();

    return NextResponse.json({ success: true, count: snapshot.size });

  } catch (error: any) {
    console.error('Cancel master order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
