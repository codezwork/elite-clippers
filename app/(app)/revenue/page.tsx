'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { getUserVideos, VideoDocument, setBatchCPM } from '@/lib/firestore';
import Link from 'next/link';

export default function RevenueDashboard() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchVideos = async () => {
    if (!user) return;
    const v = await getUserVideos(user.uid);
    setVideos(v);
    setLoading(false);
  };

  useEffect(() => {
    fetchVideos();
  }, [user]);

  const handleSaveCpm = async (videoId: string) => {
    if (!user) return;
    const cpmVal = parseFloat(editValue);
    if (isNaN(cpmVal) || cpmVal < 0) {
      setEditingId(null);
      return;
    }
    
    setIsSaving(true);
    try {
      await setBatchCPM(user.uid, [videoId], cpmVal);
      // Optimistic update
      setVideos(videos.map(v => v.id === videoId ? { ...v, cpm: cpmVal } : v));
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
      setEditingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, videoId: string) => {
    if (e.key === 'Enter') {
      handleSaveCpm(videoId);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
  const totalGross = videos.reduce((sum, v) => sum + ((v.views / 1000) * (v.cpm || 0)), 0);

  if (loading) {
    return (
      <div className="pt-4 animate-pulse">
        <div className="h-24 bg-white/5 rounded-2xl mb-6"></div>
        <div className="h-64 bg-white/5 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-24 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Revenue Tracker</h1>
        <p className="text-white/50 text-sm">Track your campaign earnings based on CPM</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md">
          <p className="text-white/50 text-sm font-medium mb-1">Total Tracked Clips</p>
          <p className="text-3xl font-bold">{videos.length}</p>
        </div>
        <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md">
          <p className="text-white/50 text-sm font-medium mb-1">Total Campaign Views</p>
          <p className="text-3xl font-bold">{totalViews.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500/20 to-green-500/5 border border-green-500/20 rounded-2xl p-5 shadow-lg backdrop-blur-md">
          <p className="text-green-400 text-sm font-medium mb-1">Total Gross Revenue</p>
          <p className="text-3xl font-bold text-white">${totalGross.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white/5 text-white/50 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-semibold">Clip</th>
                <th className="px-6 py-4 font-semibold">Account</th>
                <th className="px-6 py-4 font-semibold text-right">Views</th>
                <th className="px-6 py-4 font-semibold text-right">CPM ($)</th>
                <th className="px-6 py-4 font-semibold text-right">Gross Rev</th>
                <th className="px-6 py-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {videos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-white/50">
                    No clips added yet.
                  </td>
                </tr>
              ) : (
                videos.map((video) => {
                  const grossRev = (video.views / 1000) * (video.cpm || 0);
                  const isEditing = editingId === video.id;

                  return (
                    <tr key={video.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 bg-white/10 rounded overflow-hidden relative shrink-0">
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-[8px] text-white/50 uppercase">{video.platform}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-white/70">
                        {video.accountUsername}
                      </td>
                      <td className="px-6 py-3 text-right font-medium">
                        {video.views.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <div className="flex justify-end items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, video.id!)}
                              className="w-20 bg-black border border-blue-500 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                              disabled={isSaving}
                            />
                            <button 
                              onClick={() => handleSaveCpm(video.id!)}
                              disabled={isSaving}
                              className="text-blue-400 hover:text-blue-300 p-1"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => {
                              setEditingId(video.id!);
                              setEditValue(video.cpm?.toString() || '');
                            }}
                            className="inline-flex items-center gap-2 cursor-text group hover:bg-white/5 px-2 py-1 rounded transition-colors"
                          >
                            <span className={video.cpm ? 'text-white' : 'text-white/30'}>
                              ${video.cpm ? video.cpm.toFixed(2) : '0.00'}
                            </span>
                            <svg className="w-3 h-3 text-white/0 group-hover:text-white/30 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-green-400">
                        ${grossRev.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <Link href={`/clip/${video.id}`} className="text-white/50 hover:text-white transition-colors">
                          <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
