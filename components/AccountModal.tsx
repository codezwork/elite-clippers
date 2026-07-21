'use client';
import { useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';

export default function AccountModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // Check if the prompt is ready (Android/Chrome)
    if (window.deferredPrompt) {
      setCanInstall(true);
    }
    
    // Check if it's iOS Safari (which doesn't support deferredPrompt)
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;
    if (isIos && !isStandalone) {
      setCanInstall(true);
    }
    
    // Also listen just in case it fires while modal is open
    const handleInstallAvailable = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', handleInstallAvailable);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallAvailable);
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const handleInstallClick = async () => {
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    
    if (isIos) {
      alert("To install Elite Clipper on iOS: Tap the 'Share' icon at the bottom of Safari and select 'Add to Home Screen'.");
      return;
    }

    if (!window.deferredPrompt) return;
    
    // Show the install prompt
    window.deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await window.deferredPrompt.userChoice;
    
    // We've used the prompt, and can't use it again, throw it away
    window.deferredPrompt = null;
    setCanInstall(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 transition-opacity" 
        onClick={onClose}
      >
        <div 
          className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl shadow-black animate-in fade-in zoom-in-95 duration-200" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-bold">Account</h2>
              <button 
                onClick={onClose}
                className="p-2 -mr-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
              >
                <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 mb-6">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} 
                alt="Avatar" 
                className="w-14 h-14 rounded-full border-2 border-white/10 object-cover" 
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{user.displayName}</h3>
                <p className="text-xs text-white/50 truncate">{user.email}</p>
              </div>
            </div>

            <div className="space-y-3">
              {canInstall && (
                <button 
                  onClick={handleInstallClick}
                  className="w-full flex items-center gap-3 p-4 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-colors border border-blue-500/20 font-medium"
                >
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm text-blue-300">Install Elite Clipper</p>
                    <p className="text-[10px] text-blue-400/60 mt-0.5">Add to your home screen</p>
                  </div>
                </button>
              )}

              <button 
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 p-4 bg-white/5 hover:bg-red-500/10 text-white/70 hover:text-red-400 rounded-xl transition-colors border border-transparent hover:border-red-500/20 font-medium group"
              >
                <div className="p-2 bg-white/5 group-hover:bg-red-500/20 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Sign Out</p>
                  <p className="text-[10px] opacity-60 mt-0.5">Disconnect from this device</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
