'use client';
import { useState, useEffect } from 'react';
import { parseVideoUrl, ParsedUrl } from '@/lib/url-parser';
import { addVideo } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';

export default function AddLinkModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [parsed, setParsed] = useState<ParsedUrl | null>(null);
  const [manualUsername, setManualUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!url) {
      setParsed(null);
      setManualUsername('');
      setError('');
      return;
    }
    const delay = setTimeout(() => {
      const result = parseVideoUrl(url);
      setParsed(result);
      if (result.isValid) {
        setManualUsername(result.accountUsername || '');
        setError('');
      } else {
        setError('Unrecognized URL format. Please enter a valid TikTok, IG, YouTube, or X link.');
      }
    }, 400); // debounce
    return () => clearTimeout(delay);
  }, [url]);

  const handleSave = async () => {
    if (!parsed || !parsed.isValid || !user) return;
    
    const finalUsername = manualUsername.trim() || 'unknown';
    
    setLoading(true);
    try {
      const clipId = await addVideo(user.uid, {
        platform: parsed.platform!,
        accountUsername: finalUsername,
        link: url,
        thumbnailUrl: parsed.thumbnailUrl || null,
      });

      // Fire and forget the refresh so it populates stats/thumbnail quickly
      user.getIdToken().then(idToken => {
        fetch('/api/clips/refresh', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${idToken}` 
          },
          body: JSON.stringify({ clipId })
        }).catch(e => console.error('Auto-refresh failed:', e));
      });
      setUrl('');
      setParsed(null);
      setManualUsername('');
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save video.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-3xl p-6 shadow-2xl animate-in fade-in duration-200">
        <h2 className="text-xl font-bold mb-4">Add Content Link</h2>
        
        <input
          type="url"
          placeholder="Paste TikTok, IG, or YouTube link..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#C0392B] transition-colors mb-4"
        />

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {parsed && parsed.isValid && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 flex items-center gap-4">
            {parsed.thumbnailUrl ? (
              <img src={parsed.thumbnailUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-xs text-white/50 uppercase">{parsed.platform}</span>
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold capitalize text-white mb-1">{parsed.platform}</p>
              <input
                type="text"
                placeholder="Enter account name..."
                value={manualUsername}
                onChange={(e) => setManualUsername(e.target.value)}
                className="w-full bg-transparent border-b border-white/20 px-1 py-1 text-white/80 text-sm focus:outline-none focus:border-[#C0392B] transition-colors"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-medium">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={!parsed?.isValid || loading}
            className="flex-1 py-3 rounded-xl bg-[#C0392B] hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-[#C0392B] transition-colors font-medium"
          >
            {loading ? 'Saving...' : 'Save Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
