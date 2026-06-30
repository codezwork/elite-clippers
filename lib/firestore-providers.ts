import { db } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';

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

export async function addProvider(uid: string, provider: Omit<ProviderDocument, 'id'>) {
  const providerRef = doc(collection(db, 'users', uid, 'providers'));
  await setDoc(providerRef, provider);
  return providerRef.id;
}

export async function getProviders(uid: string): Promise<ProviderDocument[]> {
  const providersRef = collection(db, 'users', uid, 'providers');
  const snapshot = await getDocs(providersRef);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as ProviderDocument));
}

export async function updateProvider(uid: string, providerId: string, provider: Omit<ProviderDocument, 'id'>) {
  const providerRef = doc(db, 'users', uid, 'providers', providerId);
  await setDoc(providerRef, provider, { merge: true });
}

export async function deleteProvider(uid: string, providerId: string) {
  const providerRef = doc(db, 'users', uid, 'providers', providerId);
  await deleteDoc(providerRef);
}
