'use client';
import { useAuth } from '@/lib/auth-context';
import { useState, useEffect } from 'react';
import { getProviders, deleteProvider, ProviderDocument } from '@/lib/firestore-providers';
import ProviderModal from '@/components/ProviderModal';

export default function SettingsPage() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<ProviderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderDocument | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [checkingBalance, setCheckingBalance] = useState<Record<string, boolean>>({});

  const fetchProviders = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getProviders(user.uid);
    setProviders(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProviders();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Are you sure you want to delete this provider?')) return;
    await deleteProvider(user.uid, id);
    fetchProviders();
  };

  const handleEdit = (provider: ProviderDocument) => {
    setEditingProvider(provider);
    setIsModalOpen(true);
  };

  const checkBalance = async (provider: ProviderDocument) => {
    if (!user || !provider.id) return;
    setCheckingBalance(prev => ({ ...prev, [provider.id as string]: true }));
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/smm/balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ providerId: provider.id })
      });
      const data = await res.json();
      if (res.ok) {
        setBalances(prev => ({ ...prev, [provider.id as string]: `${data.currency}${data.balance}` }));
      } else {
        setBalances(prev => ({ ...prev, [provider.id as string]: 'Error' }));
      }
    } catch (e) {
      setBalances(prev => ({ ...prev, [provider.id as string]: 'Error' }));
    } finally {
      setCheckingBalance(prev => ({ ...prev, [provider.id as string]: false }));
    }
  };

  if (loading) return <div className="pt-6 animate-pulse text-white/50">Loading settings...</div>;

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-bold mb-6 tracking-tight">Settings</h1>
      
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">SMM Providers</h2>
            <p className="text-white/50 text-sm">Configure your panels and service mappings.</p>
          </div>
          <button 
            onClick={() => { setEditingProvider(null); setIsModalOpen(true); }}
            className="px-4 py-2 bg-[#C0392B] hover:bg-red-500 rounded-xl font-medium transition-colors text-sm"
          >
            Add Provider
          </button>
        </div>

        {providers.length === 0 ? (
          <div className="text-center py-8 text-white/40 border border-dashed border-white/10 rounded-xl">
            No providers configured yet.
          </div>
        ) : (
          <div className="space-y-4">
            {providers.map(provider => (
              <div key={provider.id} className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between group overflow-hidden">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-lg truncate">{provider.name}</h3>
                  <p className="text-white/40 text-xs truncate">{provider.apiUrl}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0 justify-between sm:justify-end w-full sm:w-auto">
                  <div className="text-left sm:text-right mr-2 flex-1 sm:flex-none">
                    <p className="text-xs text-white/40 mb-1">Balance</p>
                    {checkingBalance[provider.id as string] ? (
                      <div className="h-5 w-10 bg-white/10 rounded animate-pulse inline-block" />
                    ) : (
                      <p className="font-medium text-[#69C9D0]">{balances[provider.id as string] || '---'}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => checkBalance(provider)}
                      disabled={checkingBalance[provider.id as string]}
                      className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                      title="Check Balance"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                    <button onClick={() => handleEdit(provider)} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                      <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button onClick={() => handleDelete(provider.id!)} className="p-2.5 bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-500 rounded-lg transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProviderModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingProvider={editingProvider}
        onSaved={fetchProviders}
      />
    </div>
  );
}
