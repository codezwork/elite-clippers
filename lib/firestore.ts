import { db } from './firebase';
import { collection, doc, setDoc, getDocs, getDoc, query, orderBy, Timestamp, writeBatch } from 'firebase/firestore';

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
  cpm?: number;
}

export interface AccountPreferences {
  accountOrder: string[];
}

export interface AccountDocument {
  id?: string;
  platform: string;
  username: string;
  profilePictureUrl: string | null;
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

export async function setBatchCPM(uid: string, clipIds: string[], cpm: number) {
  const batch = writeBatch(db);
  for (const clipId of clipIds) {
    const videoRef = doc(db, 'users', uid, 'videos', clipId);
    batch.update(videoRef, { cpm });
  }
  await batch.commit();
}

export async function getAccountPreferences(uid: string, platform: string): Promise<string[]> {
  const prefRef = doc(db, 'users', uid, 'preferences', platform);
  const snap = await getDoc(prefRef);
  if (snap.exists()) {
    const data = snap.data() as AccountPreferences;
    return data.accountOrder || [];
  }
  return [];
}

export async function setAccountPreferences(uid: string, platform: string, accountOrder: string[]) {
  const prefRef = doc(db, 'users', uid, 'preferences', platform);
  await setDoc(prefRef, { accountOrder }, { merge: true });
}

export async function getAccount(uid: string, platform: string, username: string): Promise<AccountDocument | null> {
  const accountRef = doc(db, 'users', uid, 'accounts', `${platform}_${username}`);
  const snap = await getDoc(accountRef);
  if (snap.exists()) {
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      lastUpdated: data.lastUpdated?.toDate(),
    } as AccountDocument;
  }
  return null;
}

