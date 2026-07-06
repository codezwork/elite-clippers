'use client';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState, useRef } from 'react';
import { getUserVideos, VideoDocument, deleteVideos, getAccount, AccountDocument } from '@/lib/firestore';
import { useParams, useRouter } from 'next/navigation';
import Toast from '@/components/Toast';

export default function AccountContentGridPage() {
  const params = useParams();
  const usernameParam = params.username as string;
  const decodedUsername = decodeURIComponent(usernameParam);
  // Re-attach @ if it was stripped
  const username = decodedUsername.startsWith('@') ? decodedUsername : `@${decodedUsername}`;

  const { user } = useAuth();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [accountDoc, setAccountDoc] = useState<AccountDocument | null>(null);
  const [lastVisitedClipId, setLastVisitedClipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLastVisitedClipId(sessionStorage.getItem('lastVisitedClipId'));
  }, []);

  const fetchVideos = async () => {
    if (!user) return;
    const v = await getUserVideos(user.uid);
    const platformVideos = v.filter(vid => 
      vid.accountUsername === username || 
      vid.accountUsername === decodedUsername
    );
    setVideos(platformVideos);
    
    if (platformVideos.length > 0) {
      const platform = platformVideos[0].platform;
      const accDoc = await getAccount(user.uid, platform, platformVideos[0].accountUsername);
      setAccountDoc(accDoc);
    } else {
      // try to infer from tikwm if empty or just wait
      const accDoc = await getAccount(user.uid, 'tiktok', username);
      if (accDoc) setAccountDoc(accDoc);
    }
    
    setLoading(false);
  };

  const handleRefreshAll = async () => {
    if (!user || videos.length === 0) return;
    setRefreshing(true);
    try {
      const idToken = await user.getIdToken();
      await Promise.all(videos.map(v => 
        fetch('/api/clips/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({ clipId: v.id })
        }).catch(e => console.error(e))
      ));
      await fetchVideos();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };
  
  useEffect(() => {
    fetchVideos();
  }, [user, username, decodedUsername]);

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const idToken = await user.getIdToken();
      
      const res = await fetch('/api/profile/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ platform: 'tiktok', username: username }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setToastMessage(data.newCount > 0 ? `${data.newCount} new clips added` : 'Already up to date');
        if (data.newCount > 0) fetchVideos();
      } else if (data.error === 'SYNC_UNAVAILABLE') {
        setToastMessage('Account sync is temporarily unavailable. You can still add videos individually.');
      } else {
        setToastMessage(data.error || 'Sync failed');
      }
    } catch (e) {
      setToastMessage('Account sync is temporarily unavailable. You can still add videos individually.');
    } finally {
      setSyncing(false);
    }
  };

  const handlePointerDown = (id: string) => {
    if (isSelectionMode) return;
    longPressTimerRef.current = setTimeout(() => {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500); // 500ms for long press
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleVideoClick = (id: string) => {
    if (isSelectionMode) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    } else {
      sessionStorage.setItem('lastVisitedClipId', id);
      router.push(`/clip/${id}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (!user || selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} clip(s)?`)) return;
    setIsDeleting(true);
    try {
      await deleteVideos(user.uid, Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      await fetchVideos();
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map(v => v.id!)));
    }
  };

  if (loading) return <div className="pt-4 text-center text-white/50 animate-pulse">Loading grid...</div>;

  return (
    <div className="pt-4 pb-24 relative min-h-screen">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-colors shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="w-16 h-16 rounded-full bg-white/10 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
            {accountDoc?.profilePictureUrl ? (
              <img src={accountDoc.profilePictureUrl} alt={username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-white/50">{username.charAt(username.startsWith('@') ? 1 : 0).toUpperCase()}</span>
            )}
          </div>

          <div className="flex flex-col justify-center gap-1.5">
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">{username}</h1>
              
            </div>
            
            <div className="flex gap-2 mt-1">
              <button 
                onClick={handleSync}
                disabled={syncing || isSelectionMode}
                className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {syncing ? (
                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                <span className="hidden md:inline">{syncing ? 'Syncing...' : 'Sync Latest'}</span>
              </button>
              
              <button 
                onClick={handleRefreshAll}
                disabled={refreshing || videos.length === 0 || isSelectionMode}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/80 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {refreshing ? (
                  <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span className="hidden md:inline">Refresh All</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-3 gap-1 md:gap-2 ${isSelectionMode ? 'opacity-90' : ''}`}>
        {videos.map(video => {
          const isSelected = selectedIds.has(video.id!);
          return (
            <div 
              key={video.id} 
              onPointerDown={() => handlePointerDown(video.id!)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onClick={() => handleVideoClick(video.id!)} 
              className={`relative aspect-[9/16] bg-white/5 rounded overflow-hidden group cursor-pointer border transition-colors select-none ${isSelected ? 'border-blue-500 scale-[0.97] opacity-100' : 'border-white/5 hover:border-white/20'}`}
            >
              {video.thumbnailUrl ? (
                <img src={video.thumbnailUrl} alt="Thumbnail" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500" draggable={false} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs bg-white/5 uppercase font-medium">
                  {video.platform}
                </div>
              )}
              
              {/* Stats overlays */}
              <div className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 border border-white/10">
                <svg className="w-3 h-3 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {video.views}
              </div>
              <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 border border-white/10">
                <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                {video.likes}
              </div>

              {/* Just Visited Banner */}
              {lastVisitedClipId === video.id && !isSelectionMode && (
                <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center pointer-events-none transition-opacity duration-300">
                  <span className="text-white font-semibold text-xs bg-black/60 px-3 py-1.5 rounded-full border border-white/20 backdrop-blur-md shadow-lg">
                    Just Visited
                  </span>
                </div>
              )}

              {/* Selection overlay */}
              {isSelectionMode && (
                <div className={`absolute inset-0 transition-colors duration-200 z-20 ${isSelected ? 'bg-blue-500/20' : 'bg-black/40'}`}>
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-white/50 bg-black/30'}`}>
                    {isSelected && (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Action Bar */}
      <div className={`fixed bottom-24 left-4 right-4 bg-[#111] border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-[0_0_40px_rgba(0,0,0,0.8)] z-50 transition-all duration-300 ${isSelectionMode ? 'translate-y-0 opacity-100' : 'translate-y-32 opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="font-semibold text-sm">{selectedIds.size} selected</div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleSelectAll}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 transition-colors"
          >
            {selectedIds.size === videos.length ? 'Deselect All' : 'Select All'}
          </button>
          <button 
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0 || isDeleting}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#C0392B] hover:bg-red-500 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {isDeleting ? (
              <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            )}
            Delete
          </button>
        </div>
      </div>

      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </div>
  );
}
