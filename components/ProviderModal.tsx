'use client';
import { useState, useEffect } from 'react';
import { addProvider, updateProvider, ProviderDocument, ServiceMap } from '@/lib/firestore-providers';
import { useAuth } from '@/lib/auth-context';

export default function ProviderModal({ 
  isOpen, 
  onClose, 
  editingProvider = null,
  onSaved
}: { 
  isOpen: boolean; 
  onClose: () => void;
  editingProvider?: ProviderDocument | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [serviceMap, setServiceMap] = useState<ServiceMap>({ tiktok: {}, instagram: {}, youtube: {}, twitter: {} });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'services'>('details');

  useEffect(() => {
    if (editingProvider) {
      setName(editingProvider.name);
      setApiUrl(editingProvider.apiUrl);
      setApiKey(editingProvider.apiKey);
      setServiceMap(editingProvider.serviceMap || { tiktok: {}, instagram: {}, youtube: {}, twitter: {} });
    } else {
      setName('');
      setApiUrl('');
      setApiKey('');
      setServiceMap({ tiktok: {}, instagram: {}, youtube: {}, twitter: {} });
    }
  }, [editingProvider, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const data = { name, apiUrl, apiKey, serviceMap };
    
    try {
      if (editingProvider && editingProvider.id) {
        await updateProvider(user.uid, editingProvider.id, data);
      } else {
        await addProvider(user.uid, data);
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to save provider.');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = (platform: string, action: string, value: string) => {
    setServiceMap(prev => ({
      ...prev,
      [platform]: {
        ...(prev[platform] || {}),
        [action]: value
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-3xl p-6 shadow-2xl animate-in fade-in duration-200 flex flex-col max-h-[90vh]">
        <h2 className="text-xl font-bold mb-4">{editingProvider ? 'Edit' : 'Add'} SMM Provider</h2>
        
        <div className="flex border-b border-white/10 mb-4">
          <button 
            className={`flex-1 pb-2 font-medium transition-colors ${activeTab === 'details' ? 'text-[#C0392B] border-b-2 border-[#C0392B]' : 'text-white/50 hover:text-white'}`}
            onClick={() => setActiveTab('details')}
          >
            Connection Details
          </button>
          <button 
            className={`flex-1 pb-2 font-medium transition-colors ${activeTab === 'services' ? 'text-[#C0392B] border-b-2 border-[#C0392B]' : 'text-white/50 hover:text-white'}`}
            onClick={() => setActiveTab('services')}
          >
            Service Map
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px] pr-2 custom-scrollbar">
          {activeTab === 'details' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider mb-1 block">Provider Name</label>
                <input type="text" placeholder="e.g. SMMFollows" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#C0392B]" />
              </div>
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider mb-1 block">API URL</label>
                <input type="url" placeholder="https://panel.com/api/v2" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#C0392B]" />
              </div>
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider mb-1 block">API Key</label>
                <input type="password" placeholder="Your secret key..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#C0392B]" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-white/60 mb-2">Enter the specific Service IDs from your panel for each action.</p>
              
              {['tiktok', 'instagram', 'youtube'].map(platform => (
                <div key={platform} className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <h3 className="font-semibold capitalize mb-3 text-white/80">{platform} Services</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Views ID</label>
                      <input type="text" value={serviceMap[platform]?.views || ''} onChange={(e) => handleServiceChange(platform, 'views', e.target.value)} placeholder="e.g. 1234" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C0392B]" />
                    </div>
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Likes ID</label>
                      <input type="text" value={serviceMap[platform]?.likes || ''} onChange={(e) => handleServiceChange(platform, 'likes', e.target.value)} placeholder="e.g. 5678" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C0392B]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-white/10">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-medium">Cancel</button>
          <button onClick={handleSave} disabled={loading || !name || !apiUrl || !apiKey} className="flex-1 py-3 rounded-xl bg-[#C0392B] hover:bg-red-500 disabled:opacity-50 transition-colors font-medium">
            {loading ? 'Saving...' : 'Save Provider'}
          </button>
        </div>
      </div>
    </div>
  );
}
