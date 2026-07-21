import { NextResponse } from 'next/server';
import { InsightData, MetaApiResponse } from '@/types/meta';
import { withCache } from '@/lib/apiCache';

const TTL = 2 * 60 * 1000; // 2 min (account insights — fresher)

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function getPeriodDays(datePreset: string): number | null {
  switch (datePreset) {
    case 'last_7d':  return 7;
    case 'last_30d': return 30;
    case 'last_90d': return 90;
    default: return null;
  }
}

const fmt = (d: Date) => d.toISOString().split('T')[0];

/** Current period: N days ago → today (inclusive) */
function getCurrentRange(datePreset: string): { since: string; until: string } | null {
  if (datePreset === 'since_dec_1') {
    return { since: '2025-12-01', until: fmt(new Date()) };
  }
  const days = getPeriodDays(datePreset);
  if (!days) return null;
  const today = new Date();
  const since = new Date(today);
  since.setDate(today.getDate() - days);
  return { since: fmt(since), until: fmt(today) };
}

/** Previous period: 2N days ago → N days ago */
function getPreviousPeriodRange(datePreset: string): { since: string; until: string } | null {
  if (datePreset === 'since_dec_1') {
    const today = new Date();
    const dec1 = new Date('2025-12-01');
    const durationMs = today.getTime() - dec1.getTime();
    const prevStart = new Date(dec1.getTime() - durationMs);
    return { since: fmt(prevStart), until: '2025-11-30' };
  }
  const days = getPeriodDays(datePreset);
  if (!days) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const until = new Date(today);
  until.setDate(today.getDate() - days);

  const since = new Date(until);
  since.setDate(until.getDate() - days);

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
    const range = getCurrentRange(datePreset);
    if (range) {
      timeParams = { time_range: JSON.stringify(range) };
    } else {
      timeParams = { date_preset: datePreset };
    }
  }

  const cacheKey = `account-insights:${META_AD_ACCOUNT_ID}:${datePreset}:${mode}`;

  try {
    const data = await withCache<MetaApiResponse<InsightData>>(cacheKey, TTL, async () => {
      const params = new URLSearchParams({
        fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas',
        access_token: META_ACCESS_TOKEN!,
        ...timeParams,
      });

      const url = `${BASE_URL}/${META_AD_ACCOUNT_ID}/insights?${params.toString()}`;
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
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: `Impossible de joindre Meta API : ${message}` },
      { status: 503 }
    );
  }
}
