'use client';
import { useEffect } from 'react';

export default function Toast({ message, onClose, duration = 3000 }: { message: string; onClose: () => void; duration?: number }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) return null;
  
  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-1/2 md:right-auto md:-translate-x-1/2 z-[200] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#222]/95 backdrop-blur-md border border-[#C0392B] text-white px-5 md:px-6 py-2.5 md:py-3 rounded-lg shadow-2xl flex items-center justify-between gap-3">
        <span className="text-[13px] md:text-sm font-medium leading-tight">{message}</span>
        <button onClick={onClose} className="text-[#C0392B]/70 hover:text-[#C0392B] transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
