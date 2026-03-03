import { NextResponse } from 'next/server';
import { InsightData, MetaApiResponse } from '@/types/meta';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export async function GET(request: Request) {
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: 'Identifiants Meta API manquants dans les variables d\'environnement.' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';

  try {
    const params = new URLSearchParams({
      fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas',
      time_increment: '1',
      date_preset: datePreset,
      access_token: META_ACCESS_TOKEN,
      limit: '100',
      action_attribution_windows: JSON.stringify(['1d_click', '7d_click', '1d_view']),
    });

    const url = `${BASE_URL}/${META_AD_ACCOUNT_ID}/insights?${params.toString()}`;
    const response = await fetch(url, { cache: 'no-store' });
    const data: MetaApiResponse<InsightData> = await response.json();

    if (data.error) {
      return NextResponse.json(
        { error: `Meta API: ${data.error.message} (code ${data.error.code})` },
        { status: 400 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Erreur HTTP ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: `Impossible de joindre Meta API : ${message}` },
      { status: 503 }
    );
  }
}
