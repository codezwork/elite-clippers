'use client';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { getUserVideos, VideoDocument } from '@/lib/firestore';
import { useParams, useRouter } from 'next/navigation';

export default function PlatformAccountsPage() {
  const params = useParams();
  const platform = params.platform as string;
  const { user } = useAuth();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (user) {
      getUserVideos(user.uid).then(v => {
        setVideos(v.filter(vid => vid.platform === platform));
        setLoading(false);
      });
    }
  }, [user, platform]);

  if (loading) return <div className="pt-4 text-center text-white/50 animate-pulse">Loading accounts...</div>;

  const accounts = Array.from(new Set(videos.map(v => v.accountUsername)));

  return (
    <div className="pt-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-colors">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold tracking-tight capitalize">{platform} Accounts</h1>
      </div>

      <div className="space-y-3">
        {accounts.map(account => {
          const accountVideos = videos.filter(v => v.accountUsername === account);
          const totalViews = accountVideos.reduce((sum, v) => sum + (v.views || 0), 0);
          
          return (
            <div 
              key={account} 
              onClick={() => router.push(`/account/${account.replace('@', '')}`)}
              className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/5 overflow-hidden group-hover:scale-105 transition-transform">
                   <span className="text-xl font-bold text-white/50">{account.charAt(account.startsWith('@') ? 1 : 0).toUpperCase()}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{account}</h3>
                  <p className="text-white/40 text-xs">{accountVideos.length} clips tracked</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white/40 text-xs mb-0.5">Views</p>
                <p className="font-medium">{totalViews.toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
