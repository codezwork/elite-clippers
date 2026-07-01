import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const { providerId } = await req.json();

    if (!providerId) {
      return NextResponse.json({ error: 'Provider ID required' }, { status: 400 });
    }

    // Fetch provider from Firestore
    const providerDoc = await adminDb.collection('users').doc(uid).collection('providers').doc(providerId).get();
    if (!providerDoc.exists) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const providerData = providerDoc.data();
    if (!providerData?.apiUrl || !providerData?.apiKey) {
      return NextResponse.json({ error: 'Invalid provider configuration' }, { status: 400 });
    }

    // Standard SMM API balance check
    const url = new URL(providerData.apiUrl);
    url.searchParams.append('key', providerData.apiKey);
    url.searchParams.append('action', 'balance');

    const smmRes = await fetch(url.toString(), {
      method: 'POST',
    });

    const data = await smmRes.json();
    
    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    let currencySymbol = data.currency || data.Currency || '$';
    if (currencySymbol.toUpperCase() === 'INR') currencySymbol = '₹';
    else if (currencySymbol.toUpperCase() === 'USD') currencySymbol = '$';
    else if (currencySymbol.toUpperCase() === 'EUR') currencySymbol = '€';

    const rawBalance = parseFloat(data.balance || data.Balance || '0');
    const formattedBalance = isNaN(rawBalance) ? '0.00' : rawBalance.toFixed(2);

    return NextResponse.json({
      balance: formattedBalance,
      currency: currencySymbol
    });

  } catch (error: any) {
    console.error('Balance check error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
