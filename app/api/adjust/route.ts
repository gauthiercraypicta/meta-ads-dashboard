import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { AdjustDailyRow, AdjustCampaignSummary, AdjustTotals, AdjustResponse } from '@/types/adjust';

const TTL      = 5 * 60 * 1000;
const BASE_URL = 'https://api.adjust.com/kpis/v1';
const KPIS     = 'installs,clicks,impressions,cost,sessions';

// ─── Env config ───────────────────────────────────────────────────────────────
// ADJUST_API_TOKEN  : User auth token (Account → API Credentials in Adjust Console)
// ADJUST_APP_TOKENS : Comma-separated list of app tokens (Settings → Apps)
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
  const start = new Date(end.getTime() - dur);
  return { start_date: fmt(start), end_date: fmt(end) };
}

// ─── Adjust KPI Service response types ────────────────────────────────────────

interface KpiResult {
  token: string;
  name: string;
  currency: string;
  kpis: string[]; // e.g. ['installs','clicks','impressions','cost','sessions']
  dates: {
    date: string;
    kpis: number[];
    campaigns: {
      token: string;
      name: string;
      kpis: number[];
    }[];
  }[];
}

interface KpiResponse {
  result_set: KpiResult;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchAppKpis(
  appToken: string,
  range: { start_date: string; end_date: string },
): Promise<KpiResult | null> {
  const params = new URLSearchParams({
    start_date: range.start_date,
    end_date:   range.end_date,
    kpis:       KPIS,
    grouping:   'day,campaign',
  });
  const url = `${BASE_URL}/${appToken}?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Token token=${API_TOKEN}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    console.error(`[Adjust] ${appToken} → HTTP ${res.status}`);
    return null;
  }
  const json: KpiResponse = await res.json();
  return json.result_set ?? null;
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

function idx(kpis: string[], key: string): number { return kpis.indexOf(key); }

function deriveTotals(t: { installs: number; clicks: number; impressions: number; cost: number; sessions: number }): AdjustTotals {
  return {
    ...t,
    cpi: t.installs   > 0 ? t.cost / t.installs    : 0,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';

  if (!API_TOKEN) {
    return NextResponse.json({ error: 'ADJUST_API_TOKEN non configuré' }, { status: 503 });
  }
  if (APP_TOKENS.length === 0) {
    return NextResponse.json({ error: 'ADJUST_APP_TOKENS non configuré (ex: abc123,def456)' }, { status: 503 });
  }

  const cacheKey = `adjust:${datePreset}`;

  const result = await withCache<AdjustResponse>(cacheKey, TTL, async () => {
    const range     = getRange(datePreset);
    const prevRange = getPrevRange(range);

    // Fetch current & previous periods for all app tokens in parallel
    const [currResults, prevResults] = await Promise.all([
      Promise.all(APP_TOKENS.map((t) => fetchAppKpis(t, range))),
      Promise.all(APP_TOKENS.map((t) => fetchAppKpis(t, prevRange))),
    ]);

    const daily:     AdjustDailyRow[]       = [];
    const campMap:   Map<string, AdjustCampaignSummary> = new Map();
    const apps:      { token: string; name: string }[]  = [];

    for (const result of currResults) {
      if (!result) continue;
      apps.push({ token: result.token, name: result.name });
      const ki  = (k: string) => idx(result.kpis, k);
      const iI  = ki('installs');
      const iCl = ki('clicks');
      const iIm = ki('impressions');
      const iCo = ki('cost');
      const iSe = ki('sessions');

      for (const day of result.dates) {
        for (const camp of day.campaigns) {
          const row: AdjustDailyRow = {
            date:          day.date,
            appToken:      result.token,
            appName:       result.name,
            campaignToken: camp.token,
            campaignName:  camp.name,
            installs:      iI  >= 0 ? (camp.kpis[iI]  ?? 0) : 0,
            clicks:        iCl >= 0 ? (camp.kpis[iCl] ?? 0) : 0,
            impressions:   iIm >= 0 ? (camp.kpis[iIm] ?? 0) : 0,
            cost:          iCo >= 0 ? (camp.kpis[iCo] ?? 0) : 0,
            sessions:      iSe >= 0 ? (camp.kpis[iSe] ?? 0) : 0,
          };
          daily.push(row);

          // Aggregate per campaign
          const key = camp.token;
          const c   = campMap.get(key) ?? {
            token: camp.token, name: camp.name, appName: result.name,
            installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0,
            cpi: 0, ctr: 0, cpm: 0,
          };
          c.installs    += row.installs;
          c.clicks      += row.clicks;
          c.impressions += row.impressions;
          c.cost        += row.cost;
          c.sessions    += row.sessions;
          campMap.set(key, c);
        }
      }
    }

    // Derive campaign-level rates
    const campaigns: AdjustCampaignSummary[] = Array.from(campMap.values()).map((c) => ({
      ...c,
      cpi: c.installs   > 0 ? c.cost / c.installs    : 0,
      ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
      cpm: c.impressions > 0 ? (c.cost / c.impressions) * 1000 : 0,
    }));

    // Totals
    const totRaw = daily.reduce(
      (acc, r) => ({ installs: acc.installs + r.installs, clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions, cost: acc.cost + r.cost, sessions: acc.sessions + r.sessions }),
      { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0 },
    );
    const totals = deriveTotals(totRaw);

    // Previous totals (all rows summed)
    let prevTotals: AdjustTotals | null = null;
    const prevRaw = { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0 };
    for (const result of prevResults) {
      if (!result) continue;
      const ki  = (k: string) => idx(result.kpis, k);
      for (const day of result.dates) {
        prevRaw.installs    += day.kpis[ki('installs')]    ?? 0;
        prevRaw.clicks      += day.kpis[ki('clicks')]      ?? 0;
        prevRaw.impressions += day.kpis[ki('impressions')] ?? 0;
        prevRaw.cost        += day.kpis[ki('cost')]        ?? 0;
        prevRaw.sessions    += day.kpis[ki('sessions')]    ?? 0;
      }
    }
    if (prevRaw.installs > 0 || prevRaw.cost > 0) prevTotals = deriveTotals(prevRaw);

    return { daily, campaigns, totals, prevTotals, apps, currency: currResults[0]?.currency ?? 'USD' };
  });

  return NextResponse.json(result);
}
