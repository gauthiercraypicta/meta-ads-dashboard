import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { AdjustDailyRow, AdjustCampaignSummary, AdjustTotals, AdjustResponse } from '@/types/adjust';

const TTL          = 30 * 60 * 1000;
const KPI_BASE_URL = 'https://api.adjust.com/kpis/v1';
const REPORT_URL   = 'https://dash.adjust.com/control-center/reports-service/report';

// Event metric IDs (Reports Service format — for engagement/cart/checkout/order events)
const ENGAGE_TOKEN           = 'install_engagement_events';
const CART_METRIC            = 'cart_item_add_events';
const CHECKOUT_METRIC        = 'order_checkout_events';
const ORDER_METRIC           = 'order_placed_events';
const PRODUCT_DETAIL_METRIC  = 'product_detail_open_events';
const CART_UNIQUE_METRIC     = 'cart_item_add_unique_events';
const CHECKOUT_UNIQUE_METRIC = 'order_checkout_unique_events';
const ORDER_UNIQUE_METRIC    = 'order_placed_unique_events';
const PRODUCT_UNIQUE_METRIC  = 'product_detail_open_unique_events';

// KPI Service metrics (installs here = what Adjust UI shows, includes all attribution types)
const KPI_METRICS = ['installs', 'clicks', 'impressions', 'cost'];

// Reports Service: only needed for event metrics
const EVENT_METRICS = [
  ENGAGE_TOKEN,
  CART_METRIC, CHECKOUT_METRIC, ORDER_METRIC, PRODUCT_DETAIL_METRIC,
  CART_UNIQUE_METRIC, CHECKOUT_UNIQUE_METRIC, ORDER_UNIQUE_METRIC, PRODUCT_UNIQUE_METRIC,
];
const DIMENSIONS_EVENTS = ['day', 'campaign'];

const API_TOKEN  = process.env.ADJUST_API_TOKEN  ?? '';
const APP_TOKENS = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ─── Date helpers ─────────────────────────────────────────────────────────────

const fmt = (d: Date) => d.toISOString().split('T')[0];

function getRange(datePreset: string): { start_date: string; end_date: string } {
  const today = new Date();
  if (datePreset === 'yesterday') {
    const yesterday = fmt(new Date(today.getTime() - 86_400_000));
    return { start_date: yesterday, end_date: yesterday };
  }
  if (datePreset === 'since_dec_1') return { start_date: '2025-12-01', end_date: fmt(today) };
  const days: Record<string, number> = { last_3d: 3, last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };
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

// ─── KPI Service v1 types ─────────────────────────────────────────────────────

interface KpiDate {
  date:       string;
  kpi_values: number[];
}

interface KpiCampaign {
  token:      string;
  name:       string;
  kpi_values: number[];
  dates?:     KpiDate[];
}

interface KpiResultSet {
  token:      string;
  name:       string;
  currency:   string;
  campaigns?: KpiCampaign[];
}

interface KpiResponse {
  result_parameters: { kpis: string[] };
  result_set:        KpiResultSet;
}

// ─── Reports Service types (events only) ──────────────────────────────────────

interface ReportRow {
  day?:                 string;
  campaign?:            string;
  campaign_id_network?: string;
  app_token?:           string;
  app?:                 string;
  [key: string]:        unknown;
}

interface ReportResponse {
  rows:      ReportRow[];
  totals?:   Record<string, unknown>;
  warnings?: unknown[];
}

// ─── KPI Service fetcher ──────────────────────────────────────────────────────

async function fetchKpiReport(
  appToken: string,
  range: { start_date: string; end_date: string },
): Promise<KpiResponse> {
  const params = new URLSearchParams({
    start_date: range.start_date,
    end_date:   range.end_date,
    kpis:       KPI_METRICS.join(','),
    grouping:   'campaigns,day',
    period:     'day',
  });
  const url = `${KPI_BASE_URL}/${encodeURIComponent(appToken)}.json?${params}`;
  console.log('[Adjust KPI] requesting:', url);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Adjust KPI API HTTP ${res.status} | url=${url.slice(0, 300)} | body=${body.slice(0, 300)}`);
  }
  return res.json() as Promise<KpiResponse>;
}

// ─── Reports Service fetcher (events only) ────────────────────────────────────

async function fetchEventReport(
  appTokens: string[],
  range: { start_date: string; end_date: string },
): Promise<ReportResponse> {
  const parts: string[] = [];
  for (const t of appTokens) parts.push(`app_token[]=${encodeURIComponent(t)}`);
  parts.push(`date_period=${range.start_date}:${range.end_date}`);
  parts.push(`dimensions=${DIMENSIONS_EVENTS.join(',')}`);
  parts.push(`metrics=${EVENT_METRICS.join(',')}`);
  parts.push('limit=50000');
  const url = `${REPORT_URL}?${parts.join('&')}`;
  console.log('[Adjust Report] requesting:', url);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Adjust Report API HTTP ${res.status} | body=${body.slice(0, 300)}`);
  }
  return res.json() as Promise<ReportResponse>;
}

// ─── Flatten KPI Service response ─────────────────────────────────────────────

interface KpiRow {
  date: string; campaignToken: string; campaignName: string;
  appToken: string; appName: string;
  installs: number; clicks: number; impressions: number; cost: number;
}

function flattenKpiRows(resp: KpiResponse, todayStr: string): KpiRow[] {
  const kpis = resp.result_parameters?.kpis ?? KPI_METRICS;
  const iI  = kpis.indexOf('installs');
  const iC  = kpis.indexOf('clicks');
  const iP  = kpis.indexOf('impressions');
  const iCo = kpis.indexOf('cost');
  const rows: KpiRow[] = [];
  for (const camp of resp.result_set.campaigns ?? []) {
    for (const d of camp.dates ?? []) {
      if (d.date >= todayStr) continue; // exclude today (partial data)
      rows.push({
        date:          d.date,
        campaignToken: camp.token,
        campaignName:  camp.name,
        appToken:      resp.result_set.token,
        appName:       resp.result_set.name,
        installs:      iI  >= 0 ? (d.kpi_values[iI]  ?? 0) : 0,
        clicks:        iC  >= 0 ? (d.kpi_values[iC]  ?? 0) : 0,
        impressions:   iP  >= 0 ? (d.kpi_values[iP]  ?? 0) : 0,
        cost:          iCo >= 0 ? (d.kpi_values[iCo] ?? 0) : 0,
      });
    }
  }
  return rows;
}

// ─── Event map from Reports Service rows ──────────────────────────────────────

interface EventEntry {
  engagement: number; cartAdd: number; checkout: number; orderPlace: number;
  productDetailOpen: number; cartAddUnique: number; checkoutUnique: number;
  orderPlaceUnique: number; productDetailOpenUnique: number;
}

const EMPTY_EVENTS: EventEntry = {
  engagement: 0, cartAdd: 0, checkout: 0, orderPlace: 0, productDetailOpen: 0,
  cartAddUnique: 0, checkoutUnique: 0, orderPlaceUnique: 0, productDetailOpenUnique: 0,
};

function buildEventMap(rows: ReportRow[], todayStr: string): Map<string, EventEntry> {
  const map = new Map<string, EventEntry>();
  for (const r of rows) {
    if ((r.day ?? '') >= todayStr) continue;
    const key = `${r.campaign ?? ''}::${r.day ?? ''}`;
    const e = map.get(key) ?? { ...EMPTY_EVENTS };
    e.engagement             += Number(r[ENGAGE_TOKEN]           ?? 0);
    e.cartAdd                += Number(r[CART_METRIC]            ?? 0);
    e.checkout               += Number(r[CHECKOUT_METRIC]        ?? 0);
    e.orderPlace             += Number(r[ORDER_METRIC]           ?? 0);
    e.productDetailOpen      += Number(r[PRODUCT_DETAIL_METRIC]  ?? 0);
    e.cartAddUnique          += Number(r[CART_UNIQUE_METRIC]     ?? 0);
    e.checkoutUnique         += Number(r[CHECKOUT_UNIQUE_METRIC] ?? 0);
    e.orderPlaceUnique       += Number(r[ORDER_UNIQUE_METRIC]    ?? 0);
    e.productDetailOpenUnique += Number(r[PRODUCT_UNIQUE_METRIC] ?? 0);
    map.set(key, e);
  }
  return map;
}

// ─── Merge KPI rows + event metrics ──────────────────────────────────────────

function mergeRows(kpiRows: KpiRow[], eventMap: Map<string, EventEntry>): AdjustDailyRow[] {
  return kpiRows.map(r => {
    const ev = eventMap.get(`${r.campaignName}::${r.date}`) ?? { ...EMPTY_EVENTS };
    return {
      date:          r.date,
      appToken:      r.appToken,
      appName:       r.appName,
      campaignToken: r.campaignToken,
      campaignName:  r.campaignName,
      installs:      r.installs,
      clicks:        r.clicks,
      impressions:   r.impressions,
      cost:          r.cost,
      sessions:      0,
      timeSpent:     0,
      ...ev,
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveTotals(t: {
  installs: number; clicks: number; impressions: number; cost: number; engagement: number;
  cartAdd: number; checkout: number; orderPlace: number; timeSpent: number;
  productDetailOpen: number; cartAddUnique: number; checkoutUnique: number;
  orderPlaceUnique: number; productDetailOpenUnique: number;
}): AdjustTotals {
  return {
    ...t,
    sessions:      0,
    cpi:           t.installs    > 0 ? t.cost / t.installs    : 0,
    ctr:           t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpm:           t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0,
    cpiEngagement: t.engagement  > 0 ? t.cost / t.engagement  : 0,
  };
}

type RowSum = {
  installs: number; clicks: number; impressions: number; cost: number;
  engagement: number; cartAdd: number; checkout: number; orderPlace: number; timeSpent: number;
  productDetailOpen: number; cartAddUnique: number; checkoutUnique: number;
  orderPlaceUnique: number; productDetailOpenUnique: number;
};

function sumRows(rows: AdjustDailyRow[]): RowSum {
  return rows.reduce<RowSum>(
    (a, r) => ({
      installs:    a.installs    + r.installs,
      clicks:      a.clicks      + r.clicks,
      impressions: a.impressions + r.impressions,
      cost:        a.cost        + r.cost,
      engagement:  a.engagement  + r.engagement,
      cartAdd:     a.cartAdd     + r.cartAdd,
      checkout:    a.checkout    + r.checkout,
      orderPlace:  a.orderPlace  + r.orderPlace,
      timeSpent:   a.timeSpent   + r.timeSpent,
      productDetailOpen:       a.productDetailOpen       + r.productDetailOpen,
      cartAddUnique:           a.cartAddUnique           + r.cartAddUnique,
      checkoutUnique:          a.checkoutUnique          + r.checkoutUnique,
      orderPlaceUnique:        a.orderPlaceUnique        + r.orderPlaceUnique,
      productDetailOpenUnique: a.productDetailOpenUnique + r.productDetailOpenUnique,
    }),
    {
      installs: 0, clicks: 0, impressions: 0, cost: 0, engagement: 0,
      cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0,
      productDetailOpen: 0, cartAddUnique: 0, checkoutUnique: 0,
      orderPlaceUnique: 0, productDetailOpenUnique: 0,
    },
  );
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
      const todayStr  = fmt(new Date());

      // Concurrent: KPI Service per-app (current + prev) + Reports Service events (current + prev)
      // KPI Service gives install counts matching the Adjust UI (correct attribution methodology)
      // Reports Service gives engagement/cart/checkout/order event metrics
      const [kpiCurrentResults, kpiPrevResults, evtCurrent, evtPrev] = await Promise.all([
        Promise.all(APP_TOKENS.map(t => fetchKpiReport(t, range))),
        Promise.all(APP_TOKENS.map(t => fetchKpiReport(t, prevRange))),
        fetchEventReport(APP_TOKENS, range),
        fetchEventReport(APP_TOKENS, prevRange),
      ]);

      // Flatten KPI rows from all apps
      const kpiCurrRows = kpiCurrentResults.flatMap(r => flattenKpiRows(r, todayStr));
      const kpiPrevRows = kpiPrevResults.flatMap(r => flattenKpiRows(r, todayStr));

      // Build event maps keyed by "campaignName::date"
      const eventMapCurr = buildEventMap(evtCurrent.rows ?? [], todayStr);
      const eventMapPrev = buildEventMap(evtPrev.rows    ?? [], todayStr);

      // Merge
      const daily    = mergeRows(kpiCurrRows, eventMapCurr);
      const prevDail = mergeRows(kpiPrevRows, eventMapPrev);

      // ── Campaigns ─────────────────────────────────────────────────────────────
      const campMap = new Map<string, AdjustCampaignSummary>();
      for (const r of daily) {
        const key = r.campaignName || r.campaignToken;
        const c = campMap.get(key) ?? {
          token: r.campaignToken, name: r.campaignName, appName: r.appName,
          installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0, engagement: 0,
          cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0,
          productDetailOpen: 0, cartAddUnique: 0, checkoutUnique: 0,
          orderPlaceUnique: 0, productDetailOpenUnique: 0,
          cpi: 0, ctr: 0, cpm: 0, cpiEngagement: 0,
        };
        if (!c.token && r.campaignToken) c.token = r.campaignToken;
        c.installs    += r.installs;
        c.clicks      += r.clicks;
        c.impressions += r.impressions;
        c.cost        += r.cost;
        c.engagement  += r.engagement;
        c.cartAdd     += r.cartAdd;
        c.checkout    += r.checkout;
        c.orderPlace  += r.orderPlace;
        c.timeSpent   += r.timeSpent;
        c.productDetailOpen       += r.productDetailOpen;
        c.cartAddUnique           += r.cartAddUnique;
        c.checkoutUnique          += r.checkoutUnique;
        c.orderPlaceUnique        += r.orderPlaceUnique;
        c.productDetailOpenUnique += r.productDetailOpenUnique;
        campMap.set(key, c);
      }

      const campaigns: AdjustCampaignSummary[] = Array.from(campMap.values()).map((c) => ({
        ...c,
        cpi:           c.installs    > 0 ? c.cost / c.installs    : 0,
        ctr:           c.impressions > 0 ? c.clicks / c.impressions : 0,
        cpm:           c.impressions > 0 ? (c.cost / c.impressions) * 1000 : 0,
        cpiEngagement: c.engagement  > 0 ? c.cost / c.engagement  : 0,
      }));

      // ── Totals ────────────────────────────────────────────────────────────────
      const totals     = deriveTotals(sumRows(daily));
      const prevSum    = sumRows(prevDail);
      const prevTotals = prevSum.installs > 0 || prevSum.cost > 0
        ? deriveTotals(prevSum)
        : null;

      function prevSegment(filter: (r: AdjustDailyRow) => boolean): AdjustTotals | null {
        const s = sumRows(prevDail.filter(filter));
        return s.installs > 0 || s.cost > 0 ? deriveTotals(s) : null;
      }

      const n = (s: string) => s.toLowerCase();
      const genericPrevTotals   = prevSegment((r) => n(r.campaignName).includes('generic'));
      const iconicPrevTotals    = prevSegment((r) => n(r.campaignName).includes('iconic'));
      const otherPaidPrevTotals = prevSegment((r) => r.cost > 0 && !n(r.campaignName).includes('generic') && !n(r.campaignName).includes('iconic'));

      const paidPrevSum = sumRows(prevDail.filter((r) => r.cost > 0));
      const noncampPrevInstalls    = Math.max(0, prevSum.installs    - paidPrevSum.installs);
      const noncampPrevEngagement  = Math.max(0, prevSum.engagement  - paidPrevSum.engagement);
      const noncampPrevClicks      = Math.max(0, prevSum.clicks      - paidPrevSum.clicks);
      const noncampPrevImpressions = Math.max(0, prevSum.impressions - paidPrevSum.impressions);
      const noncampPrevTotals: AdjustTotals | null = noncampPrevInstalls > 0 ? {
        installs: noncampPrevInstalls, clicks: noncampPrevClicks, impressions: noncampPrevImpressions,
        cost: 0, sessions: 0, engagement: noncampPrevEngagement,
        cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0, productDetailOpen: 0,
        cartAddUnique: 0, checkoutUnique: 0, orderPlaceUnique: 0, productDetailOpenUnique: 0,
        cpi: 0, ctr: noncampPrevImpressions > 0 ? noncampPrevClicks / noncampPrevImpressions : 0,
        cpm: 0, cpiEngagement: 0,
      } : null;

      const apps = [...new Map(daily.map((r) => [r.appToken, { token: r.appToken, name: r.appName }])).values()];

      return { daily, campaigns, totals, prevTotals, genericPrevTotals, iconicPrevTotals, otherPaidPrevTotals, noncampPrevTotals, apps, currency: 'USD' };
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur Adjust inconnue';
    console.error('[Adjust]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
