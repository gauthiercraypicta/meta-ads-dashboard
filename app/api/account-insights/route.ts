import { NextResponse } from 'next/server';
import { InsightData, MetaApiResponse } from '@/types/meta';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function getPreviousPeriodRange(datePreset: string): { since: string; until: string } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let periodDays: number;
  switch (datePreset) {
    case 'last_7d':  periodDays = 7;  break;
    case 'last_30d': periodDays = 30; break;
    case 'last_90d': periodDays = 90; break;
    default: return null;
  }

  const until = new Date(today);
  until.setDate(today.getDate() - periodDays);

  const since = new Date(until);
  since.setDate(until.getDate() - periodDays);

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { since: fmt(since), until: fmt(until) };
}

export async function GET(request: Request) {
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
  const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN;

  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: 'Identifiants Meta API manquants dans les variables d\'environnement.' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';
  const mode       = searchParams.get('mode')        ?? 'current'; // 'current' | 'previous'

  let timeParams: Record<string, string>;

  if (mode === 'previous') {
    const range = getPreviousPeriodRange(datePreset);
    if (!range) {
      return NextResponse.json(
        { error: 'date_preset invalide pour la comparaison.' },
        { status: 400 }
      );
    }
    timeParams = { time_range: JSON.stringify(range) };
  } else {
    timeParams = { date_preset: datePreset };
  }

  try {
    const params = new URLSearchParams({
      fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas',
      access_token: META_ACCESS_TOKEN,
      ...timeParams,
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
