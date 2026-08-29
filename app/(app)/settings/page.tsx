'use client';
import { useAuth } from '@/lib/auth-context';
import { useState, useEffect } from 'react';
import { getProviders, deleteProvider, setProviderPreferences, ProviderDocument } from '@/lib/firestore-providers';
import ProviderModal from '@/components/ProviderModal';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableProviderRowProps {
  provider: ProviderDocument;
  checkingBalance: boolean;
  balance?: string;
  onCheckBalance: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableProviderRow({
  provider,
  checkingBalance,
  balance,
  onCheckBalance,
  onEdit,
  onDelete,
}: SortableProviderRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: provider.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between group overflow-hidden transition-all ${
        isDragging ? 'shadow-2xl ring-2 ring-white/20' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-lg truncate">{provider.name}</h3>
        <p className="text-white/40 text-xs truncate">{provider.apiUrl}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 shrink-0 justify-between sm:justify-end w-full sm:w-auto">
        <div className="text-left sm:text-right mr-2 flex-1 sm:flex-none">
          <p className="text-xs text-white/40 mb-1">Balance</p>
          {checkingBalance ? (
            <div className="h-5 w-10 bg-white/10 rounded animate-pulse inline-block" />
          ) : (
            <p className="font-medium text-[#69C9D0]">{balance || '---'}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onCheckBalance}
            disabled={checkingBalance}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            title="Check Balance"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button onClick={onEdit} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors" title="Edit Provider">
            <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button onClick={onDelete} className="p-2.5 bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-500 rounded-lg transition-colors" title="Delete Provider">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
          
          {/* Drag Handle */}
          <div 
            {...attributes} 
            {...listeners} 
            className="w-10 h-10 flex items-center justify-center cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 transition-colors rounded-lg hover:bg-white/5 touch-none select-none ml-1"
            title="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<ProviderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderDocument | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [checkingBalance, setCheckingBalance] = useState<Record<string, boolean>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchProviders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getProviders(user.uid);
      
      const localStorageKey = `providersOrder_${user.uid}`;
      const localSavedRaw = typeof window !== 'undefined' ? localStorage.getItem(localStorageKey) : null;
      let finalProviders = data;
      if (localSavedRaw) {
        try {
          const localOrder: string[] = JSON.parse(localSavedRaw);
          if (Array.isArray(localOrder) && localOrder.length > 0) {
            const map = new Map(data.map(p => [p.id!, p]));
            const ordered: ProviderDocument[] = [];
            localOrder.forEach(id => {
              if (map.has(id)) {
                ordered.push(map.get(id)!);
                map.delete(id);
              }
            });
            map.forEach(p => ordered.push(p));
            finalProviders = ordered;
          }
        } catch (e) {}
      }
      
      setProviders(finalProviders);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [user]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !user) return;

    const oldIndex = providers.findIndex(p => p.id === active.id);
    const newIndex = providers.findIndex(p => p.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newProviders = arrayMove(providers, oldIndex, newIndex);
      setProviders(newProviders);
      
      const newOrder = newProviders.map(p => p.id!).filter(Boolean);
      const localStorageKey = `providersOrder_${user.uid}`;
      localStorage.setItem(localStorageKey, JSON.stringify(newOrder));
      
      // Save to firestore
      setProviderPreferences(user.uid, newOrder).catch(console.error);
    }
  };

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

  const providerIds = providers.map(p => p.id!).filter(Boolean);

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-bold mb-6 tracking-tight">Settings</h1>
      
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">SMM Providers</h2>
            <p className="text-white/50 text-sm">Configure panels, drag to prioritize order, and map services.</p>
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={providerIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {providers.map(provider => (
                  <SortableProviderRow
                    key={provider.id}
                    provider={provider}
                    checkingBalance={checkingBalance[provider.id as string] || false}
                    balance={balances[provider.id as string]}
                    onCheckBalance={() => checkBalance(provider)}
                    onEdit={() => handleEdit(provider)}
                    onDelete={() => handleDelete(provider.id!)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
