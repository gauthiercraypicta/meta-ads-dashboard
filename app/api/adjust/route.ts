import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { AdjustDailyRow, AdjustCampaignSummary, AdjustTotals, AdjustResponse } from '@/types/adjust';

const TTL        = 5 * 60 * 1000;
const REPORT_URL = 'https://dash.adjust.com/control-center/reports-service/report';

// Dimensions = axes de découpe ; Metrics = valeurs numériques
const DIMENSIONS = ['day', 'app', 'app_token', 'campaign', 'campaign_id_network', 'os_name'];
const METRICS    = ['installs', 'clicks', 'impressions', 'cost'];

const API_TOKEN  = process.env.ADJUST_API_TOKEN  ?? '';
const APP_TOKENS = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ─── Date helpers ─────────────────────────────────────────────────────────────

const fmt = (d: Date) => d.toISOString().split('T')[0];

function getRange(datePreset: string): { start_date: string; end_date: string } {
  const today = new Date();
  if (datePreset === 'since_dec_1') return { start_date: '2025-12-01', end_date: fmt(today) };
  const days: Record<string, number> = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };
  const n = days[datePreset] ?? 30;
  const since = new Date(today);
  since.setDate(today.getDate() - n);
  return { start_date: fmt(since), end_date: fmt(today) };
}

function getPrevRange(curr: { start_date: string; end_date: string }): { start_date: string; end_date: string } {
  const ms  = new Date(curr.start_date).getTime();
  const me  = new Date(curr.end_date).getTime();
  const dur = me - ms;
  const end = new Date(ms - 86_400_000);
  return { start_date: fmt(new Date(end.getTime() - dur)), end_date: fmt(end) };
}

// ─── Adjust Report Service types ──────────────────────────────────────────────

interface ReportRow {
  day?:                  string;
  app?:                  string;
  app_token?:            string;
  campaign?:             string;
  campaign_id_network?:  string;
  os_name?:              string;
  installs?:             number;
  clicks?:               number;
  impressions?:          number;
  cost?:                 number;
}

interface ReportResponse {
  rows:     ReportRow[];
  totals?:  { installs?: number; clicks?: number; impressions?: number; cost?: number };
  warnings?: unknown[];
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchReport(
  appTokens: string[],
  range: { start_date: string; end_date: string },
): Promise<ReportResponse> {
  // dash.adjust.com Report Service uses date_period=YYYY-MM-DD:YYYY-MM-DD
  const parts: string[] = [];
  for (const t of appTokens) parts.push(`app_token[]=${encodeURIComponent(t)}`);
  parts.push(`date_period=${range.start_date}:${range.end_date}`);
  parts.push(`dimensions=${DIMENSIONS.join(',')}`);
  parts.push(`metrics=${METRICS.join(',')}`);
  parts.push('limit=50000');

  const url = `${REPORT_URL}?${parts.join('&')}`;
  console.log('[Adjust] requesting:', url);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Adjust Report API HTTP ${res.status} | url=${url.slice(0, 300)} | body=${body.slice(0, 300)}`);
  }

  return res.json() as Promise<ReportResponse>;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function deriveTotals(t: { installs: number; clicks: number; impressions: number; cost: number }): AdjustTotals {
  return {
    ...t,
    sessions:    0,
    cpi: t.installs    > 0 ? t.cost / t.installs    : 0,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';

  if (!API_TOKEN) {
    return NextResponse.json({ error: 'ADJUST_API_TOKEN non configuré dans Vercel' }, { status: 503 });
  }
  if (APP_TOKENS.length === 0) {
    return NextResponse.json({ error: 'ADJUST_APP_TOKENS non configuré (ex: abc123,def456)' }, { status: 503 });
  }

  try {
    const result = await withCache<AdjustResponse>(`adjust:${datePreset}`, TTL, async () => {
      const range     = getRange(datePreset);
      const prevRange = getPrevRange(range);

      const [curr, prev] = await Promise.all([
        fetchReport(APP_TOKENS, range),
        fetchReport(APP_TOKENS, prevRange),
      ]);

      // Map flat rows → AdjustDailyRow (Adjust returns numbers as strings)
      const daily: AdjustDailyRow[] = (curr.rows ?? []).map((r) => ({
        date:          r.day          ?? '',
        appToken:      r.app_token    ?? '',
        appName:       r.app          ?? r.app_token ?? '',
        campaignToken: r.campaign_id_network ?? r.campaign ?? '',
        campaignName:  r.campaign     ?? '',
        installs:      Number(r.installs     ?? 0),
        clicks:        Number(r.clicks       ?? 0),
        impressions:   Number(r.impressions  ?? 0),
        cost:          Number(r.cost         ?? 0),
        sessions:      0,
      }));

      // Aggregate by campaign
      const campMap = new Map<string, AdjustCampaignSummary>();
      for (const r of daily) {
        const key = r.campaignToken || r.campaignName;
        const c = campMap.get(key) ?? {
          token: r.campaignToken, name: r.campaignName, appName: r.appName,
          installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0,
          cpi: 0, ctr: 0, cpm: 0,
        };
        c.installs    += r.installs;
        c.clicks      += r.clicks;
        c.impressions += r.impressions;
        c.cost        += r.cost;
        campMap.set(key, c);
      }

      const campaigns: AdjustCampaignSummary[] = Array.from(campMap.values()).map((c) => ({
        ...c,
        cpi: c.installs    > 0 ? c.cost / c.installs    : 0,
        ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
        cpm: c.impressions > 0 ? (c.cost / c.impressions) * 1000 : 0,
      }));

      const ct = curr.totals ?? {};
      const totals = deriveTotals({
        installs:    Number(ct.installs    ?? 0),
        clicks:      Number(ct.clicks      ?? 0),
        impressions: Number(ct.impressions ?? 0),
        cost:        Number(ct.cost        ?? 0),
      });

      const pt = prev.totals ?? {};
      const prevTotals = Number(pt.installs ?? 0) > 0 || Number(pt.cost ?? 0) > 0
        ? deriveTotals({ installs: Number(pt.installs ?? 0), clicks: Number(pt.clicks ?? 0), impressions: Number(pt.impressions ?? 0), cost: Number(pt.cost ?? 0) })
        : null;

      const apps = [...new Map(daily.map((r) => [r.appToken, { token: r.appToken, name: r.appName }])).values()];

      return { daily, campaigns, totals, prevTotals, apps, currency: 'USD' };
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur Adjust inconnue';
    console.error('[Adjust]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
