'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getProviders, ProviderDocument } from '@/lib/firestore-providers';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function SMMControlPanel({ 
  clipId, 
  platform, 
  link,
  onOrderSuccess 
}: { 
  clipId: string, 
  platform: string, 
  link: string,
  onOrderSuccess: () => void 
}) {
  const { user } = useAuth();
  const [providers, setProviders] = useState<ProviderDocument[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [action, setAction] = useState<'views' | 'likes'>('views');
  const [quantity, setQuantity] = useState<number>(100);
  const [viewQuantities, setViewQuantities] = useState<number[]>([100, 300, 500]);
  const [customQty, setCustomQty] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Master Drip state
  const [masterPending, setMasterPending] = useState(0);
  const [masterCompleted, setMasterCompleted] = useState(0);
  const [masterLoading, setMasterLoading] = useState(false);

  useEffect(() => {
    if (user) {
      getProviders(user.uid).then(data => {
        setProviders(data);
        if (data.length > 0) setSelectedProviderId(data[0].id!);
      });
    }
  }, [user]);

  // Load custom view quantities from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('smmViewQuantities');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) {
          setViewQuantities(parsed);
          setQuantity(prev => {
            if ([100, 300, 500].includes(prev)) return parsed[0];
            return prev;
          });
        }
      } catch (e) {}
    }
  }, []);

  const handleRefreshQuantities = () => {
    const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const newQuantities = [
      randomBetween(100, 150),
      randomBetween(250, 350),
      randomBetween(450, 600)
    ];
    setViewQuantities(newQuantities);
    localStorage.setItem('smmViewQuantities', JSON.stringify(newQuantities));
    
    if (!customQty) {
      setQuantity(newQuantities[0]);
    }
  };

  // Listen to scheduled master orders
  useEffect(() => {
    if (!user || !clipId) return;
    const q = query(
      collection(db, 'users', user.uid, 'scheduled_orders'),
      where('videoId', '==', clipId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let pending = 0;
      let completed = 0;
      snapshot.forEach(doc => {
        const status = doc.data().status;
        if (status === 'pending' || status === 'processing') pending++;
        if (status === 'completed') completed++;
      });
      setMasterPending(pending);
      setMasterCompleted(completed);
    });
    return () => unsubscribe();
  }, [user, clipId]);

  const handleOrder = async () => {
    if (!user || !selectedProviderId) return;
    setLoading(true);
    setError(null);
    
    const finalQty = customQty ? parseInt(customQty) : quantity;
    if (isNaN(finalQty) || finalQty <= 0) {
      setError('Invalid quantity');
      setLoading(false);
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/smm/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          clipId,
          providerId: selectedProviderId,
          platform,
          action,
          quantity: finalQty,
          link
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place order');
      }

      setCustomQty('');
      onOrderSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMasterSchedule = async () => {
    if (!user || !selectedProviderId) return;
    setMasterLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/master/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          clipId,
          providerId: selectedProviderId,
          platform,
          videoLink: link
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule master order');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setMasterLoading(false);
    }
  };

  const handleMasterCancel = async () => {
    if (!user) return;
    setMasterLoading(true);
    try {
      const idToken = await user.getIdToken();
      await fetch('/api/master/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ clipId })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setMasterLoading(false);
    }
  };

  const hasServiceMapped = () => {
    if (!selectedProviderId) return false;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return false;
    return !!provider.serviceMap?.[platform]?.[action];
  };
  
  const hasViewsMapped = () => {
    if (!selectedProviderId) return false;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return false;
    return !!provider.serviceMap?.[platform]?.['views'];
  };

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 shadow-lg mb-6">
      <h3 className="font-semibold text-lg mb-4">SMM Control Panel</h3>
      
      {providers.length === 0 ? (
        <div className="text-sm text-white/50 text-center py-4 bg-white/5 rounded-lg border border-white/5">
          You haven't configured any SMM providers yet.<br/>
          Go to Settings to add one.
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider mb-1 block">Provider</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C0392B] appearance-none"
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider mb-1 block">Action</label>
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => { 
                  setAction('views'); 
                  if (!customQty && [10, 30, 50].includes(quantity)) setQuantity(viewQuantities[0]); 
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${action === 'views' ? 'bg-[#C0392B] text-white shadow-md' : 'text-white/40 hover:text-white'}`}
              >
                Views
              </button>
              <button 
                onClick={() => { 
                  setAction('likes'); 
                  if (!customQty && viewQuantities.includes(quantity)) setQuantity(10); 
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${action === 'likes' ? 'bg-[#C0392B] text-white shadow-md' : 'text-white/40 hover:text-white'}`}
              >
                Likes
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-white/50 uppercase tracking-wider block m-0">Quantity</label>
              {action === 'views' && (
                <button 
                  onClick={handleRefreshQuantities}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
                  title="Randomize View Quantities"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {(action === 'views' ? viewQuantities : [10, 30, 50]).map(qty => (
                <button
                  key={qty}
                  onClick={() => { setQuantity(qty); setCustomQty(''); }}
                  className={`py-2 rounded-lg text-sm transition-all border ${quantity === qty && !customQty ? 'border-[#C0392B] bg-[#C0392B]/10 text-[#C0392B] font-bold' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {qty >= 1000 ? `${qty/1000}k` : qty}
                </button>
              ))}
            </div>
            <input 
              type="number" 
              placeholder="Custom quantity..."
              value={customQty}
              onChange={(e) => { setCustomQty(e.target.value); setQuantity(0); }}
              className={`w-full bg-black/40 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors ${customQty ? 'border-[#C0392B]' : 'border-white/10'}`}
            />
          </div>

          {error && <div className="text-red-400 text-xs bg-red-400/10 p-3 rounded-lg border border-red-400/20">{error}</div>}

          {!hasServiceMapped() && providers.length > 0 && selectedProviderId && (
            <div className="text-[#F39C12] text-xs bg-[#F39C12]/10 p-3 rounded-lg border border-[#F39C12]/20">
              Warning: No Service ID mapped for {platform} {action} in this provider. Please configure it in Settings.
            </div>
          )}

          <div className="flex gap-2">
            <button 
              onClick={handleOrder}
              disabled={loading || masterLoading || !hasServiceMapped()}
              className="flex-1 py-4 rounded-xl bg-gradient-to-r from-[#C0392B] to-red-500 hover:from-red-500 hover:to-red-400 disabled:opacity-50 transition-all font-bold shadow-[0_4px_15px_rgba(192,57,43,0.3)] disabled:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Manual
                </>
              )}
            </button>
            <button 
              onClick={handleMasterSchedule}
              disabled={loading || masterLoading || !hasViewsMapped() || masterPending > 0}
              className="flex-1 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 transition-all font-bold shadow-[0_4px_15px_rgba(37,99,235,0.3)] disabled:shadow-none flex items-center justify-center gap-2"
              title="Schedule 4 random automated views over 24h"
            >
              {masterLoading && masterPending === 0 ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Master Drip
                </>
              )}
            </button>
          </div>

          {(masterPending > 0 || masterCompleted > 0) && (
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1">Master Drip Active</p>
                <p className="text-sm font-medium">{masterCompleted} of {masterPending + masterCompleted} orders placed</p>
              </div>
              {masterPending > 0 && (
                <button 
                  onClick={handleMasterCancel}
                  disabled={masterLoading}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-semibold transition-colors border border-red-500/20 flex items-center gap-1"
                >
                  {masterLoading && masterPending > 0 ? (
                     <div className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                  Cancel
                </button>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
