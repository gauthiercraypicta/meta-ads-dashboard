/**
 * /api/account-overview
 *
 * Single endpoint that returns current + previous + this_month account insights
 * in one browser→server roundtrip (replaces 3 separate /api/account-insights calls).
 * The three Meta API calls are made in parallel server-side.
 */
import { NextResponse } from 'next/server';
import { InsightData, MetaApiResponse } from '@/types/meta';
import { withCache } from '@/lib/apiCache';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const TTL = 2 * 60 * 1000; // 2 min

const FIELDS = 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas';
const fmt = (d: Date) => d.toISOString().split('T')[0];

function getPeriodDays(datePreset: string): number | null {
  switch (datePreset) {
    case 'last_7d':  return 7;
    case 'last_30d': return 30;
    case 'last_90d': return 90;
    default: return null;
  }
}

function getCurrentRange(datePreset: string): { since: string; until: string } | null {
  const days = getPeriodDays(datePreset);
  if (!days) return null;
  const today = new Date();
  const since = new Date(today);
  since.setDate(today.getDate() - days);
  return { since: fmt(since), until: fmt(today) };
}

function getPreviousRange(datePreset: string): { since: string; until: string } | null {
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

function getThisMonthRange(): { since: string; until: string } {
  const today = new Date();
  const since = new Date(today.getFullYear(), today.getMonth(), 1);
  return { since: fmt(since), until: fmt(today) };
}

async function fetchInsights(
  accountId: string,
  token: string,
  timeParams: Record<string, string>,
): Promise<InsightData | null> {
  const params = new URLSearchParams({ fields: FIELDS, access_token: token, ...timeParams });
  const res = await fetch(`${BASE_URL}/${accountId}/insights?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: MetaApiResponse<InsightData> = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message}`);
  return json.data?.[0] ?? null;
}

export async function GET(request: Request) {
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
  const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN;

  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Identifiants Meta API manquants.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';
  const cacheKey = `account-overview:${META_AD_ACCOUNT_ID}:${datePreset}`;

  try {
    const data = await withCache<{
      current:   InsightData | null;
      previous:  InsightData | null;
      thisMonth: InsightData | null;
    }>(cacheKey, TTL, async () => {
      const currentRange  = getCurrentRange(datePreset);
      const previousRange = getPreviousRange(datePreset);
      const thisMonthRange = getThisMonthRange();

      const [current, previous, thisMonth] = await Promise.all([
        fetchInsights(
          META_AD_ACCOUNT_ID!,
          META_ACCESS_TOKEN!,
          currentRange ? { time_range: JSON.stringify(currentRange) } : { date_preset: datePreset },
        ),
        fetchInsights(
          META_AD_ACCOUNT_ID!,
          META_ACCESS_TOKEN!,
          previousRange ? { time_range: JSON.stringify(previousRange) } : { date_preset: datePreset },
        ),
        fetchInsights(
          META_AD_ACCOUNT_ID!,
          META_ACCESS_TOKEN!,
          { time_range: JSON.stringify(thisMonthRange) },
        ),
      ]);

      return { current, previous, thisMonth };
    });

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: `Impossible de charger les données : ${message}` }, { status: 503 });
  }
}
