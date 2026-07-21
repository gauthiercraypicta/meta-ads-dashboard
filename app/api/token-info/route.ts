import { NextResponse } from 'next/server';

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export async function GET() {
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

  if (!META_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: 'META_ACCESS_TOKEN manquant dans les variables d\'environnement.' },
      { status: 500 }
    );
  }

  try {
    // debug_token with the token inspecting itself
    const debugParams = new URLSearchParams({
      input_token: META_ACCESS_TOKEN,
      access_token: META_ACCESS_TOKEN,
    });

    const debugUrl = `https://graph.facebook.com/debug_token?${debugParams.toString()}`;
    const debugRes = await fetch(debugUrl, { next: { revalidate: 0 } });
    const debugData = await debugRes.json();

    if (debugData.error) {
      return NextResponse.json(
        { error: `Meta API: ${debugData.error.message} (code ${debugData.error.code})` },
        { status: 400 }
      );
    }

    const info = debugData.data ?? {};

    // Also fetch accessible ad accounts to give context
    let adAccounts: { id: string; name: string; account_status: number }[] = [];
    try {
      const accParams = new URLSearchParams({
        fields: 'id,name,account_status',
        access_token: META_ACCESS_TOKEN,
        limit: '25',
      });
      const accUrl = `${BASE_URL}/me/adaccounts?${accParams.toString()}`;
      const accRes = await fetch(accUrl, { next: { revalidate: 0 } });
      const accData = await accRes.json();
      if (!accData.error && accData.data) {
        adAccounts = accData.data;
      }
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      appId: info.app_id,
      appName: info.application,
      type: info.type,
      userId: info.user_id,
      isValid: info.is_valid,
      expiresAt: info.expires_at ? new Date(info.expires_at * 1000).toISOString() : null,
      neverExpires: info.expires_at === 0,
      scopes: info.scopes ?? [],
      granularScopes: info.granular_scopes ?? [],
      adAccountId: META_AD_ACCOUNT_ID ?? null,
      adAccounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: `Impossible de joindre Meta API : ${message}` },
      { status: 503 }
    );
  }
}
