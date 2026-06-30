import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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
    const { clipId, providerId, platform, action, quantity, link } = await req.json();

    if (!clipId || !providerId || !platform || !action || !quantity || !link) {
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

    // 2. Extract mapped Service ID
    const serviceId = providerData.serviceMap?.[platform]?.[action];
    if (!serviceId) {
      return NextResponse.json({ error: `No service mapped for ${platform} ${action}` }, { status: 400 });
    }

    // 3. Make request to SMM Panel
    // Standard API: POST/GET apiUrl?key=...&action=add&service=...&link=...&quantity=...
    const url = new URL(providerData.apiUrl);
    url.searchParams.append('key', providerData.apiKey);
    url.searchParams.append('action', 'add');
    url.searchParams.append('service', serviceId);
    url.searchParams.append('link', link);
    url.searchParams.append('quantity', quantity.toString());

    const smmRes = await fetch(url.toString(), {
      method: 'POST',
    });

    const data = await smmRes.json();
    
    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    const smmOrderId = data.order ? data.order.toString() : 'unknown';

    // 4. Log the order to Firestore
    const orderRef = adminDb.collection('users').doc(uid).collection('videos').doc(clipId).collection('orders').doc();
    await orderRef.set({
      providerId,
      providerName: providerData.name,
      serviceId,
      action,
      quantity,
      smmOrderId,
      status: 'Pending',
      timestamp: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true, orderId: smmOrderId });

  } catch (error: any) {
    console.error('SMM Order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
