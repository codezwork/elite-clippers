import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
    const { clipId, videoLink, providerId, platform } = await req.json();

    if (!clipId || !videoLink || !providerId || !platform) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate 4 timestamps over 24 hours (24 * 60 * 60 * 1000 = 86400000 ms)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    // Divide 24 hours into 4 buckets of 6 hours each
    // Pick a random time in each bucket.
    const timestamps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const bucketStart = now + (i * 6 * oneHour);
      const bucketEnd = bucketStart + (6 * oneHour);
      // Ensure at least a 90 minute gap from previous timestamp if i > 0
      const minStart = i > 0 ? Math.max(bucketStart, timestamps[i-1] + (90 * 60 * 1000)) : bucketStart;
      if (minStart > bucketEnd) {
        timestamps.push(timestamps[i-1] + (90 * 60 * 1000));
      } else {
        timestamps.push(minStart + Math.random() * (bucketEnd - minStart));
      }
    }

    const batch = adminDb.batch();
    const scheduleRef = adminDb.collection('users').doc(uid).collection('scheduled_orders');

    timestamps.forEach((ts) => {
      const docRef = scheduleRef.doc();
      const randomQty = Math.floor(Math.random() * 51) + 100; // 100 to 150
      batch.set(docRef, {
        videoId: clipId,
        videoLink,
        providerId,
        serviceId: 'views', // Master button only schedules views
        platform,
        quantity: randomQty,
        scheduledTime: Timestamp.fromMillis(ts),
        status: 'pending',
        retryCount: 0,
        lockedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        completedAt: null,
        failureReason: null,
        apiOrderId: null
      });
    });

    await batch.commit();

    return NextResponse.json({ success: true, count: 4 });

  } catch (error: any) {
    console.error('Schedule master order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
