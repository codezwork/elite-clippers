import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
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

    let { platform, username } = await req.json();

    if (platform !== 'tiktok') {
      return NextResponse.json({ error: 'Only TikTok supported currently' }, { status: 400 });
    }

    // Normalize username to always start with @
    if (!username.startsWith('@')) {
      username = `@${username}`;
    }

    // Tikwm usually expects username without @ or properly encoded
    const tikwmUsername = username.slice(1);

    // 1. Fetch video list from Tikwm public API
    let videoList: any[] = [];
    try {
      const tikwmRes = await fetch(
        `https://www.tikwm.com/api/user/posts?unique_id=${tikwmUsername}&count=30&cursor=0`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible)',
            'Accept': 'application/json',
          },
        }
      );

      if (!tikwmRes.ok) {
        throw new Error('Tikwm returned non-200 status');
      }

      const tikwmData = await tikwmRes.json();

      if (tikwmData.code !== 0 || !tikwmData.data?.videos) {
        throw new Error('Tikwm response did not contain video data');
      }

      videoList = tikwmData.data.videos.map((v: any) => ({
        videoId: String(v.video_id),
        thumbnailUrl: v.cover || '',
        views: v.play_count || 0,
        likes: v.digg_count || 0,
        link: `https://www.tiktok.com/${username}/video/${v.video_id}`,
      }));

    } catch (tikwmError) {
      console.error('Tikwm fetch failed:', tikwmError);
      return NextResponse.json(
        { error: 'SYNC_UNAVAILABLE' },
        { status: 503 }
      );
    }

    if (videoList.length === 0) {
      return NextResponse.json({ newCount: 0, message: 'No videos found on this profile' });
    }

    // 2. Deduplicate against existing Firestore docs
    const existingSnap = await adminDb
      .collection('users').doc(uid)
      .collection('videos')
      .where('platform', '==', 'tiktok')
      .where('accountUsername', '==', username)
      .get();

    const existingIds = new Set(
      existingSnap.docs.map(d => d.data().videoId)
    );

    const newVideos = videoList.filter(v => !existingIds.has(v.videoId));

    if (newVideos.length === 0) {
      return NextResponse.json({ newCount: 0, message: 'All clips already synced' });
    }

    // 3. Batch write new videos to Firestore
    const batch = adminDb.batch();
    const newDocIds: string[] = [];
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const now = Date.now();
    newVideos.forEach((video, index) => {
      const ref = adminDb.collection('users').doc(uid).collection('videos').doc();
      batch.set(ref, {
        platform: 'tiktok',
        accountUsername: username,
        videoId: video.videoId,
        link: video.link,
        thumbnailUrl: video.thumbnailUrl || '',
        views: video.views || 0,
        likes: video.likes || 0,
        addedAt: new Date(now - index * 1000), // Stagger by 1 second so newest appears at top
        lastUpdated: new Date(),
        syncedFromProfile: true,
      });
      newDocIds.push(ref.id);
    });

    await batch.commit();

    // 4. Fire refresh for each new video to get accurate stats
    for (const docId of newDocIds) {
      fetch(`${origin}/api/clips/refresh`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}` 
        },
        body: JSON.stringify({ clipId: docId }),
      }).catch(() => {}); // intentional fire-and-forget
    }

    return NextResponse.json({ newCount: newVideos.length });

  } catch (error) {
    console.error('Profile sync route failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
