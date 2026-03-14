import { NextResponse } from 'next/server';
import { InsightData, MetaApiResponse } from '@/types/meta';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/** Convert date_preset to explicit time_range including today */
function toTimeRange(datePreset: string): { since: string; until: string } {
  const today = new Date();
  const until = today.toISOString().split('T')[0];

  let days: number;
  switch (datePreset) {
    case 'last_7d':  days = 7;  break;
    case 'last_90d': days = 90; break;
    case 'last_30d':
    default:         days = 30; break;
  }

  const since = new Date(today);
  since.setDate(today.getDate() - days);

  return { since: since.toISOString().split('T')[0], until };
}

/** Paginated fetch to get all daily rows */
async function fetchAllPages(url: string, maxPages = 10): Promise<InsightData[]> {
  const results: InsightData[] = [];
  let next: string | null = url;
  let page = 0;

  while (next && page < maxPages) {
    const res = await fetch(next, { next: { revalidate: 60 } });
    const data: MetaApiResponse<InsightData> = await res.json();

    if (data.error) throw new Error(`Meta API: ${data.error.message} (code ${data.error.code})`);
    if (data.data) results.push(...data.data);

    next = data.paging?.next ?? null;
    page++;
  }

  return results;
}

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
  const timeRange = toTimeRange(datePreset);

  try {
    const params = new URLSearchParams({
      fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,unique_actions,purchase_roas',
      time_increment: '1',
      time_range: JSON.stringify(timeRange),
      access_token: META_ACCESS_TOKEN,
      limit: '200',
      action_attribution_windows: JSON.stringify(['7d_click', '1d_view', '7d_click_first_conversion', '1d_view_first_conversion']),
    });

    const url = `${BASE_URL}/${META_AD_ACCOUNT_ID}/insights?${params.toString()}`;
    const allData = await fetchAllPages(url);

    return NextResponse.json({ data: allData });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: `Impossible de charger les données journalières : ${message}` },
      { status: 503 }
    );
  }
}
