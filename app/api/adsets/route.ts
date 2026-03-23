import { NextResponse } from 'next/server';
import { AdSet, MetaApiResponse } from '@/types/meta';
import { withCache } from '@/lib/apiCache';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const TTL = 5 * 60 * 1000; // 5 min

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
  const cacheKey = `adsets:${META_AD_ACCOUNT_ID}:${datePreset}`;

  const insightFields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas';
  const insightsClause = datePreset === 'since_dec_1'
    ? `insights.time_range({"since":"2025-12-01","until":"${new Date().toISOString().split('T')[0]}"}){${insightFields}}`
    : `insights.date_preset(${datePreset}){${insightFields}}`;

  try {
    const data = await withCache<MetaApiResponse<AdSet>>(cacheKey, TTL, async () => {
      const fields = [
        'id',
        'name',
        'status',
        'campaign_id',
        insightsClause,
      ].join(',');

      const params = new URLSearchParams({
        fields,
        access_token: META_ACCESS_TOKEN!,
        limit: '200',
      });

      const url = `${BASE_URL}/${META_AD_ACCOUNT_ID}/adsets?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });

    if (data.error) {
      return NextResponse.json(
        { error: `Meta API: ${data.error.message} (code ${data.error.code})` },
        { status: 400 }
      );
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: `Impossible de joindre Meta API : ${message}` },
      { status: 503 }
    );
  }
}
