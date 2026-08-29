import { db } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

export interface ServiceMap {
  [platform: string]: {
    [action: string]: string;
  };
}

export interface ProviderDocument {
  id?: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  serviceMap: ServiceMap;
}

export async function getProviderPreferences(uid: string): Promise<string[]> {
  try {
    const prefRef = doc(db, 'users', uid, 'preferences', 'smm_providers');
    const snap = await getDoc(prefRef);
    if (snap.exists()) {
      const data = snap.data();
      return data?.providerOrder || [];
    }
  } catch (e) {
    console.error('Error fetching provider preferences:', e);
  }
  return [];
}

export async function setProviderPreferences(uid: string, providerOrder: string[]): Promise<void> {
  const prefRef = doc(db, 'users', uid, 'preferences', 'smm_providers');
  await setDoc(prefRef, { providerOrder }, { merge: true });
}

export async function addProvider(uid: string, provider: Omit<ProviderDocument, 'id'>) {
  const providerRef = doc(collection(db, 'users', uid, 'providers'));
  await setDoc(providerRef, provider);
  return providerRef.id;
}

export async function getProviders(uid: string): Promise<ProviderDocument[]> {
  const providersRef = collection(db, 'users', uid, 'providers');
  const [snapshot, savedOrder] = await Promise.all([
    getDocs(providersRef),
    getProviderPreferences(uid)
  ]);
  
  const providers = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as ProviderDocument));

  let activeOrder = savedOrder;
  if (typeof window !== 'undefined') {
    const localSavedRaw = localStorage.getItem(`providersOrder_${uid}`);
    if (localSavedRaw) {
      try {
        const localSaved = JSON.parse(localSavedRaw);
        if (Array.isArray(localSaved) && localSaved.length > 0) {
          activeOrder = localSaved;
        }
      } catch (e) {}
    }
  }

  if (activeOrder && activeOrder.length > 0) {
    const orderMap = new Map<string, number>();
    activeOrder.forEach((id, index) => orderMap.set(id, index));
    
    providers.sort((a, b) => {
      const indexA = a.id && orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
      const indexB = b.id && orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
      return indexA - indexB;
    });
  }

  return providers;
}

export async function updateProvider(uid: string, providerId: string, provider: Omit<ProviderDocument, 'id'>) {
  const providerRef = doc(db, 'users', uid, 'providers', providerId);
  await setDoc(providerRef, provider, { merge: true });
}

export async function deleteProvider(uid: string, providerId: string) {
  const providerRef = doc(db, 'users', uid, 'providers', providerId);
  await deleteDoc(providerRef);
}
