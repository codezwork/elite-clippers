import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import * as cheerio from 'cheerio';
import { FieldValue } from 'firebase-admin/firestore';

async function fetchFromTikWM(url: string) {
  const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }
  });
  
  if (!res.ok) throw new Error(`TikWM returned ${res.status}`);
  
  const data = await res.json();
  if (data.code !== 0 || !data.data) {
    throw new Error('TikWM returned empty data object');
  }

  return {
    views: parseInt(data.data.play_count) || 0,
    likes: parseInt(data.data.digg_count) || 0,
  };
}

async function fetchFromRapidAPI(url: string) {
  const res = await fetch(`https://tiktok-video-no-watermark2.p.rapidapi.com/?url=${encodeURIComponent(url)}&hd=1`, {
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || '6c57a260d4mshaea891895b41d1ep188775jsnc7d9a2a37ec0',
      'x-rapidapi-host': 'tiktok-video-no-watermark2.p.rapidapi.com',
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) throw new Error(`RapidAPI returned ${res.status}`);

  const data = await res.json();
  
  let views = 0;
  let likes = 0;

  const searchForStats = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    
    if (obj.play_count !== undefined) views = typeof obj.play_count === 'string' ? parseKMB(obj.play_count) : obj.play_count;
    else if (obj.playCount !== undefined) views = typeof obj.playCount === 'string' ? parseKMB(obj.playCount) : obj.playCount;
    
    if (obj.digg_count !== undefined) likes = typeof obj.digg_count === 'string' ? parseKMB(obj.digg_count) : obj.digg_count;
    else if (obj.diggCount !== undefined) likes = typeof obj.diggCount === 'string' ? parseKMB(obj.diggCount) : obj.diggCount;
    else if (obj.like_count !== undefined) likes = typeof obj.like_count === 'string' ? parseKMB(obj.like_count) : obj.like_count;

    if (views > 0 && likes > 0) return;
    
    for (const key of Object.keys(obj)) {
      searchForStats(obj[key]);
    }
  };
  
  searchForStats(data);
  
  if (views === 0 && likes === 0) {
    throw new Error('RapidAPI returned empty data object or stats not found');
  }

  return { views, likes };
}

async function scrapeTikTok(url: string) {
  let thumbnailUrl = null;
  let views = 0;
  let likes = 0;
  let accountUsername = null;

  try {
    // 1. Fetch OEmbed for Thumbnail & Author
    const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      thumbnailUrl = data.thumbnail_url || null;
      accountUsername = data.author_name || null;
    }
  } catch (e) {
    console.warn('TikTok OEmbed error', e);
  }

  try {
    // 2. Primary attempt: TikWM
    const tikwmStats = await fetchFromTikWM(url);
    views = tikwmStats.views;
    likes = tikwmStats.likes;
  } catch (tikwmError) {
    console.warn('TikWM primary scraper failed:', tikwmError);
    // 3. Fallback attempt: RapidAPI
    try {
      const rapidStats = await fetchFromRapidAPI(url);
      views = rapidStats.views;
      likes = rapidStats.likes;
    } catch (rapidError) {
      console.warn('RapidAPI fallback scraper failed:', rapidError);
    }
  }

  return { thumbnailUrl, views, likes, accountUsername };
}

async function scrapeYouTube(url: string) {
  let views = 0;
  let likes = 0;

  try {
    const htmlRes = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const html = await htmlRes.text();
    const $ = cheerio.load(html);

    $('meta[itemprop="interactionCount"]').each((_, el) => {
      const val = $(el).attr('content');
      if (val) {
        if (views === 0) views = parseInt(val);
      }
    });

    const scriptTags = $('script').filter((_, el) => {
      return $(el).html()?.includes('ytInitialData =') || false;
    });

    if (scriptTags.length > 0) {
      const scriptContent = scriptTags.first().html() || '';
      const match = scriptContent.match(/ytInitialData\s*=\s*(\{.*?\});/);
      if (match && match[1]) {
        try {
          const data = JSON.parse(match[1]);
          const searchForLikes = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.likeCount !== undefined && typeof obj.likeCount === 'number') likes = obj.likeCount;
            if (obj.factoid && obj.factoid.value && obj.factoid.value.accessibilityText) {
              const text = obj.factoid.value.accessibilityText.toLowerCase();
              if (text.includes('like')) {
                likes = parseKMB(text.replace(/[^0-9KMBkmb.]/g, ''));
              }
            }
            if (likes > 0) return;
            for (const key of Object.keys(obj)) {
              searchForLikes(obj[key]);
            }
          };
          searchForLikes(data);
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn('YouTube HTML scrape error', e);
  }

  return { views, likes };
}

async function scrapeInstagram(url: string) {
  let thumbnailUrl = null;
  let views = 0;
  let likes = 0;
  let accountUsername = null;

  try {
    const htmlRes = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const html = await htmlRes.text();
    const $ = cheerio.load(html);

    thumbnailUrl = $('meta[property="og:image"]').attr('content') || null;
    
    const description = $('meta[property="og:description"]').attr('content') || '';
    
    const likesMatch = description.match(/([\d,KMBkmb.]+)\s*Likes/i);
    if (likesMatch && likesMatch[1]) {
      likes = parseKMB(likesMatch[1]);
    }

    const handleMatch = description.match(/\(@([a-zA-Z0-9_.]+)\)/);
    if (handleMatch && handleMatch[1]) {
      accountUsername = handleMatch[1];
    } else {
      const ogTitle = $('meta[property="og:title"]').attr('content') || '';
      const titleMatch = ogTitle.match(/([a-zA-Z0-9_.]+) on Instagram/);
      if (titleMatch && titleMatch[1]) {
        accountUsername = titleMatch[1];
      }
    }

    const viewsMatch = description.match(/([\d,KMBkmb.]+)\s*Views/i);
    if (viewsMatch && viewsMatch[1]) {
      views = parseKMB(viewsMatch[1]);
    } else if (likes > 0 && views === 0) {
      views = likes * 5; 
    }
  } catch (e) {
    console.warn('Instagram HTML scrape error', e);
  }

  return { thumbnailUrl, views, likes, accountUsername };
}

function parseKMB(str: string): number {
  if (!str) return 0;
  let numStr = str.replace(/,/g, '').trim().toUpperCase();
  let multiplier = 1;
  if (numStr.endsWith('K')) {
    multiplier = 1000;
    numStr = numStr.slice(0, -1);
  } else if (numStr.endsWith('M')) {
    multiplier = 1000000;
    numStr = numStr.slice(0, -1);
  } else if (numStr.endsWith('B')) {
    multiplier = 1000000000;
    numStr = numStr.slice(0, -1);
  }
  const parsed = parseFloat(numStr);
  return isNaN(parsed) ? 0 : Math.floor(parsed * multiplier);
}

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

    const clipRef = adminDb.collection('users').doc(uid).collection('videos').doc(clipId);
    const clipSnap = await clipRef.get();
    
    if (!clipSnap.exists) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const clipData = clipSnap.data()!;
    const platform = clipData.platform;
    const url = clipData.link;

    let updates: any = {
      lastUpdated: FieldValue.serverTimestamp()
    };

    if (platform === 'tiktok') {
      const data = await scrapeTikTok(url);
      if (data.views > 0) updates.views = data.views;
      if (data.likes > 0) updates.likes = data.likes;
      if (data.thumbnailUrl && !clipData.thumbnailUrl) updates.thumbnailUrl = data.thumbnailUrl;
      if (data.accountUsername && clipData.accountUsername === 'unknown') updates.accountUsername = data.accountUsername;
    } else if (platform === 'youtube') {
      const data = await scrapeYouTube(url);
      if (data.views > 0) updates.views = data.views;
      if (data.likes > 0) updates.likes = data.likes;
    } else if (platform === 'instagram') {
      const data = await scrapeInstagram(url);
      if (data.views > 0) updates.views = data.views;
      if (data.likes > 0) updates.likes = data.likes;
      if (data.thumbnailUrl && !clipData.thumbnailUrl) updates.thumbnailUrl = data.thumbnailUrl;
      if (data.accountUsername && clipData.accountUsername === 'unknown') updates.accountUsername = data.accountUsername;
    }

    await clipRef.update(updates);

    return NextResponse.json({ success: true, updates });

  } catch (error: any) {
    console.error('Scrape error:', error);
    return NextResponse.json({ error: 'Failed to refresh data', details: error.message }, { status: 500 });
  }
}
