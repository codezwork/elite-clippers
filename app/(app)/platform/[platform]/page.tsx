'use client';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { getUserVideos, VideoDocument, getAccountPreferences, setAccountPreferences, getAccount, AccountDocument } from '@/lib/firestore';
import { useParams, useRouter } from 'next/navigation';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableAccountRowProps {
  account: string;
  videos: VideoDocument[];
  accountDoc: AccountDocument | null;
  onClick: () => void;
}

function SortableAccountRow({ account, videos, accountDoc, onClick }: SortableAccountRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: account });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
  const initial = account.charAt(account.startsWith('@') ? 1 : 0).toUpperCase();

  return (
    <div ref={setNodeRef} style={style} className={`p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all flex items-center justify-between group ${isDragging ? 'shadow-2xl ring-2 ring-white/20' : ''}`}>
      <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={onClick}>
        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/5 overflow-hidden group-hover:scale-105 transition-transform shrink-0">
          {accountDoc?.profilePictureUrl ? (
            <img src={`/api/image-proxy?url=${encodeURIComponent(accountDoc.profilePictureUrl)}`} alt={account} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-white/50">{initial}</span>
          )}
        </div>
        <div>
          <h3 className="font-semibold text-lg">{account}</h3>
          <p className="text-white/40 text-xs">{videos.length} clips tracked</p>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-white/40 text-xs mb-0.5">Views</p>
          <p className="font-medium">{totalViews.toLocaleString()}</p>
        </div>
        
        {/* Drag Handle */}
        <div 
          {...attributes} 
          {...listeners} 
          className="w-10 h-10 flex items-center justify-center cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 transition-colors rounded-lg hover:bg-white/5 touch-none select-none"
          onClick={(e) => e.stopPropagation()} // prevent row click
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function PlatformAccountsPage() {
  const params = useParams();
  const platform = params.platform as string;
  const { user } = useAuth();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [accountsOrder, setAccountsOrder] = useState<string[]>([]);
  const [accountDocs, setAccountDocs] = useState<Record<string, AccountDocument | null>>({});
  const [loading, setLoading] = useState(true);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // requires 5px drag to start for mouse
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }), // requires 250ms hold for touch
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        const [userVideos, savedOrder] = await Promise.all([
          getUserVideos(user.uid),
          getAccountPreferences(user.uid, platform)
        ]);
        
        const platformVideos = userVideos.filter(vid => vid.platform === platform);
        setVideos(platformVideos);
        
        // Extract unique accounts
        const uniqueAccounts = Array.from(new Set(platformVideos.map(v => v.accountUsername)));
        
        // Reconcile saved order with current accounts
        const localStorageKey = `accountsOrder_${user.uid}_${platform}`;
        const localSavedRaw = localStorage.getItem(localStorageKey);
        let activeSavedOrder = savedOrder;
        
        if (localSavedRaw) {
          try {
            const localSaved = JSON.parse(localSavedRaw);
            if (Array.isArray(localSaved) && localSaved.length >= savedOrder.length) {
              activeSavedOrder = localSaved;
            }
          } catch (e) {}
        }

        const ordered = [...activeSavedOrder.filter(a => uniqueAccounts.includes(a))];
        const newAccounts = uniqueAccounts.filter(a => !activeSavedOrder.includes(a));
        // Force new accounts to go to the bottom
        const finalOrder = [...ordered, ...newAccounts];
        setAccountsOrder(finalOrder);

        // If we found new accounts or it's the first time, persist the locked-in order immediately
        if (newAccounts.length > 0 || activeSavedOrder.length !== finalOrder.length) {
          localStorage.setItem(localStorageKey, JSON.stringify(finalOrder));
          setAccountPreferences(user.uid, platform, finalOrder).catch(console.error);
        }

        // Fetch account docs for profile pictures
        const docs: Record<string, AccountDocument | null> = {};
        await Promise.all(finalOrder.map(async (acc) => {
          const doc = await getAccount(user.uid, platform, acc);
          docs[acc] = doc;
        }));
        setAccountDocs(docs);
        
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user, platform]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !user) return;

    const oldIndex = accountsOrder.indexOf(active.id as string);
    const newIndex = accountsOrder.indexOf(over.id as string);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(accountsOrder, oldIndex, newIndex);
      setAccountsOrder(newOrder);
      
      const localStorageKey = `accountsOrder_${user.uid}_${platform}`;
      localStorage.setItem(localStorageKey, JSON.stringify(newOrder));
      
      // save to firestore in background
      setAccountPreferences(user.uid, platform, newOrder).catch(console.error);
    }
  };

  if (loading) return <div className="pt-4 text-center text-white/50 animate-pulse">Loading accounts...</div>;

  return (
    <div className="pt-4 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/')} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-colors">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold tracking-tight capitalize">{platform} Accounts</h1>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={accountsOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {accountsOrder.map(account => {
              const accountVideos = videos.filter(v => v.accountUsername === account);
              const accountDoc = accountDocs[account] || null;
              
              return (
                <SortableAccountRow 
                  key={account} 
                  account={account} 
                  videos={accountVideos} 
                  accountDoc={accountDoc}
                  onClick={() => router.push(`/account/${account.replace('@', '')}`)} 
                />
              );
            })}
            
            {accountsOrder.length === 0 && (
              <div className="text-center p-8 bg-white/5 rounded-xl border border-white/10">
                <p className="text-white/50">No accounts tracked for {platform} yet.</p>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
