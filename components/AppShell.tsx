'use client';
import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AddLinkModal from './AddLinkModal';
import AccountModal from './AccountModal';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="w-8 h-8 border-4 border-[#C0392B] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-lg border-b border-white/10 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-transparent">
            <img src="/elite-logo.png" alt="Elite Mamba Logo" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-lg tracking-tight">Elite Mamba</span>
        </div>
        <div className="relative group cursor-pointer" onClick={() => setIsAccountModalOpen(true)}>
          <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} alt="Avatar" className="w-9 h-9 rounded-full border-2 border-white/10 object-cover" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-3xl mx-auto p-4">
        {children}
      </main>

      {/* Global FAB */}
      <button 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-[#C0392B] hover:bg-red-500 transition-colors rounded-full shadow-[0_0_20px_rgba(192,57,43,0.4)] flex items-center justify-center z-40 text-white"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 w-full h-16 bg-[#0a0a0a]/90 backdrop-blur-xl border-t border-white/10 z-50 pb-safe">
        <div className="max-w-md mx-auto h-full flex justify-around items-center">
          <Link href="/" className={`flex flex-col items-center gap-1 transition-colors ${pathname === '/' ? 'text-[#C0392B]' : 'text-white/40 hover:text-white/70'}`}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span className="text-[10px] font-medium">Dashboard</span>
          </Link>
          <Link href="/revenue" className={`flex flex-col items-center gap-1 transition-colors ${pathname === '/revenue' ? 'text-[#C0392B]' : 'text-white/40 hover:text-white/70'}`}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] font-medium">Revenue</span>
          </Link>
          <Link href="/settings" className={`flex flex-col items-center gap-1 transition-colors ${pathname === '/settings' ? 'text-[#C0392B]' : 'text-white/40 hover:text-white/70'}`}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-medium">Settings</span>
          </Link>
        </div>
      </nav>
      
      <AddLinkModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <AccountModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} />
    </div>
  );
}
