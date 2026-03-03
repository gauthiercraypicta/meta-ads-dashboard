import { NextResponse } from 'next/server';
import { AdSet, MetaApiResponse } from '@/types/meta';

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
    const fields = [
      'id',
      'name',
      'status',
      'campaign_id',
      `insights.date_preset(${datePreset}){spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas}`,
    ].join(',');

    const params = new URLSearchParams({
      fields,
      access_token: META_ACCESS_TOKEN,
      limit: '200',
    });

    const url = `${BASE_URL}/${META_AD_ACCOUNT_ID}/adsets?${params.toString()}`;

    const response = await fetch(url, { cache: 'no-store' });
    const data: MetaApiResponse<AdSet> = await response.json();

    if (data.error) {
      return NextResponse.json(
        { error: `Meta API: ${data.error.message} (code ${data.error.code})` },
        { status: 400 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Erreur HTTP ${response.status} lors de l'appel à Meta API` },
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
