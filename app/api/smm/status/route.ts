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
    const { clipId, orderId, providerId, smmOrderId } = await req.json();

    if (!clipId || !orderId || !providerId || !smmOrderId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch provider details
    const providerDoc = await adminDb.collection('users').doc(uid).collection('providers').doc(providerId).get();
    if (!providerDoc.exists) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const providerData = providerDoc.data();
    if (!providerData?.apiUrl || !providerData?.apiKey) {
      return NextResponse.json({ error: 'Invalid provider configuration' }, { status: 400 });
    }

    // 2. Fetch order status from SMM panel
    const url = new URL(providerData.apiUrl);
    url.searchParams.append('key', providerData.apiKey);
    url.searchParams.append('action', 'status');
    url.searchParams.append('order', smmOrderId);

    const smmRes = await fetch(url.toString(), {
      method: 'POST',
    });

    const data = await smmRes.json();
    
    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    // 3. Update Firestore order document
    const orderRef = adminDb.collection('users').doc(uid).collection('videos').doc(clipId).collection('orders').doc(orderId);
    
    const updates: any = {};
    if (data.status) updates.status = data.status;
    if (data.start_count !== undefined) updates.startCount = data.start_count;
    if (data.remains !== undefined) updates.remains = data.remains;
    
    // Some panels return lowercase status, let's format it for consistency if we want, but storing as returned is fine too
    if (updates.status) {
      // Capitalize first letter (e.g. "pending" -> "Pending", "completed" -> "Completed")
      updates.status = updates.status.charAt(0).toUpperCase() + updates.status.slice(1).toLowerCase();
    }

    if (Object.keys(updates).length > 0) {
      await orderRef.update(updates);
    }

    return NextResponse.json({ success: true, updates });

  } catch (error: any) {
    console.error('SMM Status check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
