import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';

const TTL = 15 * 60 * 1000; // 15 min (hourly historical data)

const API_VERSION = 'v21.0';
const BASE_URL    = `https://graph.facebook.com/${API_VERSION}`;

/** Convert date_preset to explicit time_range including today */
function toTimeRange(datePreset: string): { since: string; until: string } {
  const today = new Date();
  const until = today.toISOString().split('T')[0];

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawHourlyRow {
  hourly_stats_aggregated_by_advertiser_time_zone?: string; // e.g. "14:00:00 - 14:59:59"
  date_start?: string;   // "YYYY-MM-DD"
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  actions?: { action_type: string; value: string; '7d_click'?: string }[];
  action_values?: { action_type: string; value: string; '7d_click'?: string }[];
  purchase_roas?: { action_type: string; value: string }[];
}

export interface HeatmapApiCell {
  day: number;   // 0=Lun … 6=Dim
  hour: number;  // 0–23
  roas: number;
  spend: number;
  conversions: number;
  ctr: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConversions(row: RawHourlyRow): number {
  const actions = row.actions ?? [];
  const types   = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
  for (const t of types) {
    const a = actions.find((a) => a.action_type === t);
    if (a) return parseFloat(a['7d_click'] ?? a.value ?? '0') || 0;
  }
  return 0;
}

// JS getDay() → 0=Sun, 1=Mon…6=Sat  →  convert to  0=Lun…6=Dim
function jsDayToIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// Parse Meta API format "14:00:00 - 14:59:59" → 14
function parseHour(raw: string): number {
  return parseInt(raw.split(':')[0], 10) || 0;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
  const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN;

  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Identifiants Meta manquants.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';

  const cacheKey = `heatmap:${META_AD_ACCOUNT_ID}:${datePreset}`;

  try {
    const result = await withCache<{ data: HeatmapApiCell[]; timezoneName: string; timezoneOffset: number }>(
      cacheKey,
      TTL,
      async () => {
    // Fetch account timezone + insights in parallel
    const tzParams = new URLSearchParams({
      fields:       'timezone_name,timezone_offset_hours_utc',
      access_token: META_ACCESS_TOKEN!,
    });
    const timeRange = toTimeRange(datePreset);
    const insightParams = new URLSearchParams({
      fields:         'spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
      time_increment: '1',
      breakdowns:     'hourly_stats_aggregated_by_advertiser_time_zone',
      time_range:     JSON.stringify(timeRange),
      access_token:   META_ACCESS_TOKEN!,
      limit:          '5000',
    });

    const [tzRes, insightRes] = await Promise.all([
      fetch(`${BASE_URL}/${META_AD_ACCOUNT_ID}?${tzParams}`),
      fetch(`${BASE_URL}/${META_AD_ACCOUNT_ID}/insights?${insightParams}`),
    ]);

    const [tzJson, json] = await Promise.all([tzRes.json(), insightRes.json()]);

    const timezoneName:   string = tzJson.timezone_name ?? 'UTC';
    const timezoneOffset: number = tzJson.timezone_offset_hours_utc ?? 0;

    if (json.error) throw new Error(`Meta API: ${json.error.message} (code ${json.error.code})`);

    const rows: RawHourlyRow[] = json.data ?? [];

    // ── Aggregate by (day_of_week, hour) ──────────────────────────────────
    // For ROAS/CTR: weighted average by spend
    // For conversions/spend: sum

    type BucketKey = `${number}-${number}`;
    const buckets = new Map<
      BucketKey,
      { spend: number; convValue: number; conversions: number; impressions: number; clicks: number; count: number }
    >();

    for (const row of rows) {
      const hourlyRaw = row.hourly_stats_aggregated_by_advertiser_time_zone;
      const dateRaw   = row.date_start;
      if (!hourlyRaw || !dateRaw) continue;

      const hour    = parseHour(hourlyRaw);
      const jsDay   = new Date(dateRaw + 'T12:00:00').getDay(); // noon to avoid DST issues
      const dayIdx  = jsDayToIndex(jsDay);
      const key: BucketKey = `${dayIdx}-${hour}`;

      const spend       = parseFloat(row.spend ?? '0') || 0;
      const impressions = parseInt(row.impressions ?? '0', 10) || 0;
      const clicks      = parseInt(row.clicks ?? '0', 10) || 0;
      const conversions = getConversions(row);

      // ROAS from purchase_roas field (if present) or compute from action_values
      let convValue = 0;
      if (row.purchase_roas?.length) {
        convValue = (parseFloat(row.purchase_roas[0].value) || 0) * spend;
      } else {
        const av = (row.action_values ?? []).find(
          (a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase',
        );
        convValue = parseFloat(av?.value ?? '0') || 0;
      }

      const existing = buckets.get(key);
      if (existing) {
        existing.spend       += spend;
        existing.convValue   += convValue;
        existing.conversions += conversions;
        existing.impressions += impressions;
        existing.clicks      += clicks;
        existing.count       += 1;
      } else {
        buckets.set(key, { spend, convValue, conversions, impressions, clicks, count: 1 });
      }
    }

    // Convert buckets → HeatmapApiCell[]
    const cells: HeatmapApiCell[] = [];
    for (const [key, b] of buckets.entries()) {
      const [dayStr, hourStr] = key.split('-');
      const day  = parseInt(dayStr,  10);
      const hour = parseInt(hourStr, 10);

      const roas = b.spend > 0 ? b.convValue / b.spend : 0;
      const ctr  = b.impressions > 0 ? b.clicks / b.impressions : 0;

      cells.push({ day, hour, roas, spend: b.spend, conversions: b.conversions, ctr });
    }

    return { data: cells, timezoneName, timezoneOffset };
      }, // end withCache fn
    );

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=900, stale-while-revalidate=1800' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: `Impossible de joindre Meta API : ${message}` }, { status: 503 });
  }
}
