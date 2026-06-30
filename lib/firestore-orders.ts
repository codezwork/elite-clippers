import { db } from './firebase';
import { collection, doc, setDoc, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';

export interface OrderDocument {
  id?: string;
  providerId: string;
  providerName: string;
  serviceId: string;
  action: string;
  quantity: number;
  smmOrderId: string;
  status: string;
  timestamp: any;
}

export async function addOrder(uid: string, clipId: string, orderData: Omit<OrderDocument, 'id' | 'timestamp'>) {
  const orderRef = doc(collection(db, 'users', uid, 'videos', clipId, 'orders'));
  await setDoc(orderRef, {
    ...orderData,
    timestamp: serverTimestamp()
  });
  return orderRef.id;
}

export async function getOrders(uid: string, clipId: string): Promise<OrderDocument[]> {
  const ordersRef = collection(db, 'users', uid, 'videos', clipId, 'orders');
  const q = query(ordersRef, orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as OrderDocument));
}
