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
      
      // Fallback to Apify with Token Rotation
      try {
        // Read multiple tokens separated by commas, or fallback to single token
        const tokensString = process.env.APIFY_API_TOKENS || process.env.APIFY_API_TOKEN || '';
        const apifyTokens = tokensString.split(',').map(t => t.trim()).filter(Boolean);
        
        if (apifyTokens.length === 0) {
          throw new Error('No Apify tokens configured');
        }

        let apifyData = null;
        let lastError = null;

        for (const token of apifyTokens) {
          try {
            const apifyRes = await fetch(
              `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${token}`,
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

            // 402 Payment Required or 403 Forbidden usually means quota is exhausted
            if (apifyRes.status === 402 || apifyRes.status === 403 || apifyRes.status === 429) {
              console.warn(`Apify token ${token.substring(0, 5)}... exhausted/rate-limited with status ${apifyRes.status}. Trying next...`);
              lastError = new Error(`Apify quota exhausted (HTTP ${apifyRes.status})`);
              continue;
            }

            if (!apifyRes.ok) {
              throw new Error(`Apify returned ${apifyRes.status}`);
            }
            
            apifyData = await apifyRes.json();
            break; // Success! Break out of the loop
          } catch (err) {
            console.error(`Apify fetch failed for token ${token.substring(0, 5)}...`, err);
            lastError = err;
            // Loop continues to next token
          }
        }

        if (!apifyData) {
          throw lastError || new Error('All Apify tokens failed');
        }
        
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

    return NextResponse.json({ newCount: newVideos.length });

  } catch (error) {
    console.error('Profile sync route failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
