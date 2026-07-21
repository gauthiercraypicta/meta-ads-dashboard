import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const TTL = 10 * 60 * 1000;

function toTimeRange(datePreset: string): { since: string; until: string } {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const until = yesterday.toISOString().split('T')[0];

  if (datePreset === 'since_dec_1') {
    return { since: '2025-12-01', until };
  }

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

interface RawInsightRow {
  ad_id: string;
  ad_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  actions?: { action_type: string; value: string }[];
}

export interface CreativeDecayPoint {
  adId: string;
  adName: string;
  date: string;
  ctr: number;
  cpa: number;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
}

export async function GET(request: Request) {
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Identifiants Meta manquants.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';
  const cacheKey = `creative-decay:${META_AD_ACCOUNT_ID}:${datePreset}`;

  try {
    const result = await withCache<CreativeDecayPoint[]>(cacheKey, TTL, async () => {
      const timeRange = toTimeRange(datePreset);

      const fields = [
        'ad_id', 'ad_name', 'date_start',
        'spend', 'impressions', 'clicks', 'ctr', 'actions',
      ].join(',');

      const params = new URLSearchParams({
        fields,
        level: 'ad',
        time_increment: '1',
        time_range: JSON.stringify(timeRange),
        filtering: JSON.stringify([
          { field: 'impressions', operator: 'GREATER_THAN', value: '0' },
        ]),
        limit: '5000',
        access_token: META_ACCESS_TOKEN!,
      });

      const url = `${BASE_URL}/${META_AD_ACCOUNT_ID}/insights?${params}`;
      const allRows: RawInsightRow[] = [];
      let next: string | null = url;
      let page = 0;

      while (next && page < 10) {
        const res: Response = await fetch(next, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(`Meta API: ${json.error.message}`);
        if (json.data) allRows.push(...json.data);
        next = json.paging?.next ?? null;
        page++;
      }

      const PURCHASE_TYPES = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'];

      return allRows.map((row): CreativeDecayPoint => {
        const spend = parseFloat(row.spend ?? '0') || 0;
        const impressions = parseInt(row.impressions ?? '0', 10) || 0;
        const clicks = parseInt(row.clicks ?? '0', 10) || 0;
        const ctr = parseFloat(row.ctr ?? '0') || 0;

        let purchases = 0;
        for (const t of PURCHASE_TYPES) {
          const a = (row.actions ?? []).find((a) => a.action_type === t);
          if (a) { purchases = parseFloat(a.value ?? '0') || 0; break; }
        }

        const cpa = purchases > 0 ? spend / purchases : 0;

        return { adId: row.ad_id, adName: row.ad_name, date: row.date_start, ctr, cpa, spend, impressions, clicks, purchases };
      });
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: `Impossible de joindre Meta API : ${message}` }, { status: 503 });
  }
}
