export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'twitter';

export interface ParsedUrl {
  platform: Platform | null;
  accountUsername: string | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  isValid: boolean;
}

export function parseVideoUrl(url: string): ParsedUrl {
  let platform: Platform | null = null;
  let accountUsername: string | null = null;
  let videoId: string | null = null;
  let thumbnailUrl: string | null = null;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const pathname = urlObj.pathname;

    if (hostname.includes('tiktok.com')) {
      platform = 'tiktok';
      // format: /@username/video/12345
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 3 && parts[0].startsWith('@') && parts[1] === 'video') {
        accountUsername = parts[0];
        videoId = parts[2];
      }
    } else if (hostname.includes('instagram.com')) {
      platform = 'instagram';
      // format: /reel/ABC123/ or /p/ABC123/ or /username/reel/ABC123/
      const parts = pathname.split('/').filter(Boolean);
      const reelIndex = parts.indexOf('reel');
      const pIndex = parts.indexOf('p');
      if (reelIndex !== -1) {
        videoId = parts[reelIndex + 1];
        if (reelIndex > 0) accountUsername = `@${parts[reelIndex - 1]}`;
      } else if (pIndex !== -1) {
        videoId = parts[pIndex + 1];
        if (pIndex > 0) accountUsername = `@${parts[pIndex - 1]}`;
      }
    } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      platform = 'youtube';
      if (hostname.includes('youtu.be')) {
        videoId = pathname.slice(1);
      } else if (pathname.startsWith('/shorts/')) {
        videoId = pathname.replace('/shorts/', '').split('/')[0];
      } else if (pathname.startsWith('/watch')) {
        videoId = urlObj.searchParams.get('v');
      }
      if (videoId) {
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    } else if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
      platform = 'twitter';
      // format: /username/status/12345
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 3 && parts[1] === 'status') {
        accountUsername = `@${parts[0]}`;
        videoId = parts[2];
      }
    }
  } catch (e) {
    // Invalid URL (will return isValid: false)
  }

  return {
    platform,
    accountUsername,
    videoId,
    thumbnailUrl,
    isValid: !!platform && !!videoId,
  };
}
