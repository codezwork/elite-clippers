import { db } from './firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, Timestamp, writeBatch } from 'firebase/firestore';

export interface VideoDocument {
  id?: string;
  platform: string;
  accountUsername: string;
  link: string;
  thumbnailUrl: string | null;
  views: number;
  likes: number;
  addedAt: Date;
  lastUpdated: Date;
}

export async function addVideo(uid: string, video: Omit<VideoDocument, 'id' | 'views' | 'likes' | 'addedAt' | 'lastUpdated'>) {
  const videoRef = doc(collection(db, 'users', uid, 'videos'));
  const data = {
    ...video,
    views: 0,
    likes: 0,
    addedAt: Timestamp.now(),
    lastUpdated: Timestamp.now(),
  };
  await setDoc(videoRef, data);
  return videoRef.id;
}

export async function getUserVideos(uid: string): Promise<VideoDocument[]> {
  const videosRef = collection(db, 'users', uid, 'videos');
  const q = query(videosRef, orderBy('addedAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    addedAt: doc.data().addedAt.toDate(),
    lastUpdated: doc.data().lastUpdated.toDate(),
  } as VideoDocument));
}

export async function deleteVideos(uid: string, clipIds: string[]) {
  const batch = writeBatch(db);
  for (const clipId of clipIds) {
    const videoRef = doc(db, 'users', uid, 'videos', clipId);
    
    // Fetch orders to delete them
    const ordersRef = collection(db, 'users', uid, 'videos', clipId, 'orders');
    const ordersSnap = await getDocs(ordersRef);
    ordersSnap.forEach((orderDoc) => {
      batch.delete(orderDoc.ref);
    });
    
    // Delete the video itself
    batch.delete(videoRef);
  }
  await batch.commit();
}
