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

    // 1. Fetch video list from Tikwm public API (Primary) or Apify (Fallback)
    let videoList: any[] = [];
    let profilePictureUrl = null;
    
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

      if (!tikwmRes.ok) throw new Error('Tikwm returned non-200 status');
      const tikwmData = await tikwmRes.json();
      if (tikwmData.code !== 0 || !tikwmData.data?.videos) throw new Error('Tikwm response did not contain video data');

      videoList = tikwmData.data.videos.map((v: any) => ({
        videoId: String(v.video_id),
        thumbnailUrl: v.cover || '',
        views: v.play_count || 0,
        likes: v.digg_count || 0,
        link: `https://www.tiktok.com/${username}/video/${v.video_id}`,
      }));

      // Also try fetching profile picture from TikWM if primary succeeds
      const userInfoRes = await fetch(
        `https://www.tikwm.com/api/user/info?unique_id=${tikwmUsername}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible)',
            'Accept': 'application/json',
          },
        }
      );
      if (userInfoRes.ok) {
        const userInfoData = await userInfoRes.json();
        if (userInfoData.code === 0 && userInfoData.data?.user?.avatarMedium) {
          profilePictureUrl = userInfoData.data.user.avatarMedium;
        }
      }

    } catch (tikwmError) {
      console.warn('Tikwm user/posts fetch failed:', tikwmError);
      
      // Fallback to Apify
      try {
        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              profiles: [username],
              resultsPerPage: 30
            })
          }
        );

        if (!apifyRes.ok) throw new Error(`Apify returned ${apifyRes.status}`);
        const apifyData = await apifyRes.json();
        if (!Array.isArray(apifyData)) throw new Error('Apify response is not an array');
        
        // Map clockworks/tiktok-scraper response
        videoList = apifyData.filter((v: any) => v.id).map((v: any) => ({
          videoId: String(v.id),
          thumbnailUrl: v.videoMeta?.coverUrl || v.videoMeta?.originalCoverUrl || '',
          views: v.playCount || 0,
          likes: v.diggCount || 0,
          link: v.webVideoUrl || `https://www.tiktok.com/${username}/video/${v.id}`,
        }));
        
        // Extract profile picture from the authorMeta of the first video
        if (apifyData.length > 0 && apifyData[0].authorMeta?.avatar) {
          profilePictureUrl = apifyData[0].authorMeta.avatar;
        }
        
      } catch (apifyError) {
        console.error('Apify fallback failed:', apifyError);
        return NextResponse.json(
          { error: 'All scraping services are currently unavailable.' },
          { status: 500 }
        );
      }
    }

    // Upsert account document
    try {
      await adminDb.collection('users').doc(uid).collection('accounts').doc(`${platform}_${username}`).set({
        platform,
        username,
        profilePictureUrl,
        lastUpdated: new Date()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to save account info', e);
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

    const existingVideoDocs = new Map();
    existingSnap.docs.forEach(d => {
      existingVideoDocs.set(d.data().videoId, d);
    });

    const newVideos = videoList.filter(v => !existingVideoDocs.has(v.videoId));
    const existingVideosToUpdate = videoList.filter(v => existingVideoDocs.has(v.videoId));

    const batch = adminDb.batch();

    existingVideosToUpdate.forEach(video => {
      const doc = existingVideoDocs.get(video.videoId);
      if (doc) {
        batch.update(doc.ref, {
          thumbnailUrl: video.thumbnailUrl || doc.data().thumbnailUrl || '',
          views: video.views || doc.data().views || 0,
          likes: video.likes || doc.data().likes || 0,
          lastUpdated: new Date()
        });
      }
    });

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
      }).catch(() => { }); // intentional fire-and-forget
    }

    return NextResponse.json({ newCount: newVideos.length });

  } catch (error) {
    console.error('Profile sync route failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
