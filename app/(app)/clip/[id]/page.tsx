'use client';
import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useCallback } from 'react';
import { getUserVideos, VideoDocument } from '@/lib/firestore';
import { getOrders, OrderDocument } from '@/lib/firestore-orders';
import { useParams, useRouter } from 'next/navigation';
import SMMControlPanel from '@/components/SMMControlPanel';

export default function ClipDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const router = useRouter();
  
  const [clip, setClip] = useState<VideoDocument | null>(null);
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingOrders, setRefreshingOrders] = useState<Record<string, boolean>>({});

  const handleRefreshStats = async () => {
    if (!user || !clip?.id) return;
    setRefreshing(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/clips/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ clipId: clip.id })
      });
      if (res.ok) {
        await fetchClipAndOrders();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshOrderStatus = async (orderId?: string, providerId?: string, smmOrderId?: string) => {
    if (!user || !clip?.id || !orderId || !providerId || !smmOrderId) return;
    setRefreshingOrders(prev => ({ ...prev, [orderId]: true }));
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/smm/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ clipId: clip.id, orderId, providerId, smmOrderId })
      });
      if (res.ok) {
        await fetchClipAndOrders(); // Re-fetch to show new status
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshingOrders(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const fetchClipAndOrders = useCallback(async () => {
    if (!user || !id) return;
    try {
      const allVideos = await getUserVideos(user.uid);
      const found = allVideos.find(v => v.id === id);
      if (found) {
        setClip(found);
        const fetchedOrders = await getOrders(user.uid, id as string);
        setOrders(fetchedOrders);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    fetchClipAndOrders();
  }, [fetchClipAndOrders]);

  if (loading) return <div className="pt-6 animate-pulse">Loading clip details...</div>;
  
  if (!clip) return (
    <div className="pt-10 text-center text-white/50">
      <h2 className="text-xl font-bold mb-2 text-white">Clip Not Found</h2>
      <button onClick={() => router.back()} className="text-[#C0392B] hover:underline">Go back</button>
    </div>
  );

  return (
    <div className="pt-6 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-colors">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold truncate">Clip Details</h1>
        </div>
        
        <button 
          onClick={handleRefreshStats} 
          disabled={refreshing}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/80 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {refreshing ? (
            <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh Stats
        </button>
      </div>

      <div className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-6 flex gap-4 overflow-hidden shadow-lg">
        {clip.thumbnailUrl ? (
          <img src={clip.thumbnailUrl} alt="Thumbnail" className="w-24 h-32 object-cover rounded-xl bg-white/5" />
        ) : (
          <div className="w-24 h-32 bg-white/5 rounded-xl flex items-center justify-center">
            <span className="text-xs text-white/40 uppercase font-bold tracking-widest">{clip.platform}</span>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className="text-[10px] text-[#C0392B] font-bold uppercase tracking-wider mb-1">{clip.platform}</p>
          <h2 className="text-lg font-semibold truncate mb-1">{clip.accountUsername}</h2>
          <a href={clip.link} target="_blank" rel="noreferrer" className="text-xs text-[#C0392B] hover:text-red-400 transition-colors inline-flex items-center gap-1 font-semibold mb-4">
            Watch Video &rarr;
          </a>
          
          <div className="flex gap-4 bg-white/5 p-3 rounded-xl border border-white/5 items-center">
            <div className="flex items-center gap-2" title="Views">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              <span className="font-semibold text-sm">{clip.views?.toLocaleString() || 0}</span>
            </div>
            <div className="flex items-center gap-2" title="Likes">
              <svg className="w-4 h-4 text-white/40" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              <span className="font-semibold text-sm">{clip.likes?.toLocaleString() || 0}</span>
            </div>
            <div className="flex-1 text-right">
              <button 
                onClick={handleRefreshStats}
                disabled={refreshing}
                className="p-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-full transition-colors inline-flex items-center justify-center border border-white/5"
                title="Refresh stats"
              >
                <svg className={`w-4 h-4 text-white/70 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <SMMControlPanel 
        clipId={clip.id!} 
        platform={clip.platform} 
        link={clip.link} 
        onOrderSuccess={fetchClipAndOrders} 
      />

      <div>
        <h3 className="font-semibold text-lg mb-4 pl-1">Order History</h3>
        {orders.length === 0 ? (
          <div className="text-center py-8 bg-black/20 rounded-2xl border border-white/5 border-dashed">
            <p className="text-sm text-white/40">No orders placed for this clip yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} className="bg-black/30 border border-white/5 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm capitalize flex items-center gap-2">
                    {order.quantity.toLocaleString()} {order.action}
                  </p>
                  <p className="text-xs text-white/40 mt-1">{order.providerName} &bull; Order ID: {order.smmOrderId}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleRefreshOrderStatus(order.id, order.providerId, order.smmOrderId)}
                      disabled={order.id ? refreshingOrders[order.id] : false}
                      className="text-white/40 hover:text-white/80 transition-colors disabled:opacity-50"
                      title="Check latest status"
                    >
                      <svg className={`w-3.5 h-3.5 ${order.id && refreshingOrders[order.id] ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border ${
                      order.status.toLowerCase() === 'completed' ? 'bg-green-500/20 text-green-400 border-green-500/20' :
                      order.status.toLowerCase() === 'canceled' || order.status.toLowerCase() === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/20' :
                      order.status.toLowerCase() === 'in progress' || order.status.toLowerCase() === 'processing' ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' :
                      'bg-[#F39C12]/20 text-[#F39C12] border-[#F39C12]/20'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  {((order as any).startCount !== undefined || (order as any).remains !== undefined) && (
                    <p className="text-[10px] text-white/40 mt-1">
                      Start: {(order as any).startCount ?? '-'} &bull; Remains: {(order as any).remains ?? '-'}
                    </p>
                  )}
                  <p className="text-[10px] text-white/30 mt-2">
                    {order.timestamp?.toDate ? order.timestamp.toDate().toLocaleDateString() : 'Just now'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
