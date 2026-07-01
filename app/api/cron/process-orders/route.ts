import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    if (token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Invalid cron secret' }, { status: 401 });
    }

    const now = Timestamp.now();
    
    // 1. Find pending orders that are due
    const snapshot = await adminDb
      .collectionGroup('scheduled_orders')
      .where('status', '==', 'pending')
      .where('scheduledTime', '<=', now)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    const results = {
      processed: snapshot.size,
      succeeded: 0,
      failed: 0
    };

    // Process sequentially (could be parallelized, but this is safer for rate limits)
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const docRef = docSnap.ref;
      
      // Extract uid from the path: users/{uid}/scheduled_orders/{id}
      const uid = docRef.parent.parent?.id;
      if (!uid) {
        await docRef.update({ status: 'failed', failureReason: 'Missing UID' });
        results.failed++;
        continue;
      }

      // Lock the document
      await docRef.update({ status: 'processing', lockedAt: FieldValue.serverTimestamp() });

      try {
        // Fetch provider config
        const providerDoc = await adminDb.collection('users').doc(uid).collection('providers').doc(data.providerId).get();
        if (!providerDoc.exists) {
          throw new Error('Provider not found');
        }

        const providerData = providerDoc.data();
        if (!providerData?.apiUrl || !providerData?.apiKey) {
          throw new Error('Invalid provider configuration');
        }

        const serviceId = providerData.serviceMap?.[data.platform]?.[data.serviceId];
        if (!serviceId) {
          throw new Error(`No service mapped for ${data.platform} ${data.serviceId}`);
        }

        // Call SMM Provider
        const url = new URL(providerData.apiUrl);
        url.searchParams.append('key', providerData.apiKey);
        url.searchParams.append('action', 'add');
        url.searchParams.append('service', serviceId);
        url.searchParams.append('link', data.videoLink);
        url.searchParams.append('quantity', data.quantity.toString());

        const smmRes = await fetch(url.toString(), { method: 'POST' });
        const smmData = await smmRes.json();
        
        if (smmData.error) {
          throw new Error(smmData.error);
        }

        const smmOrderId = smmData.order ? smmData.order.toString() : 'unknown';

        // Success - update schedule doc
        await docRef.update({
          status: 'completed',
          completedAt: FieldValue.serverTimestamp(),
          apiOrderId: smmOrderId
        });

        // Log to regular orders
        const orderLogRef = adminDb.collection('users').doc(uid).collection('videos').doc(data.videoId).collection('orders').doc();
        await orderLogRef.set({
          providerId: data.providerId,
          providerName: providerData.name,
          serviceId: data.serviceId,
          action: data.serviceId, // 'views'
          quantity: data.quantity,
          smmOrderId,
          status: 'Pending',
          timestamp: FieldValue.serverTimestamp(),
          isMasterAutomated: true
        });

        results.succeeded++;
      } catch (err: any) {
        // Handle failure and retry logic
        const newRetryCount = (data.retryCount || 0) + 1;
        if (newRetryCount >= 3) {
          await docRef.update({
            status: 'failed',
            failureReason: err.message || 'Unknown error',
            retryCount: newRetryCount
          });
        } else {
          // Revert back to pending to try again later
          await docRef.update({
            status: 'pending',
            lockedAt: null,
            retryCount: newRetryCount,
            failureReason: err.message || 'Unknown error'
          });
        }
        results.failed++;
      }
    }

    return NextResponse.json({ success: true, ...results });

  } catch (error: any) {
    console.error('Process scheduled orders error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
