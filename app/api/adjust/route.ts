import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { AdjustDailyRow, AdjustCampaignSummary, AdjustTotals, AdjustResponse } from '@/types/adjust';

const TTL        = 30 * 60 * 1000;
const REPORT_URL = 'https://dash.adjust.com/control-center/reports-service/report';

const ENGAGE_TOKEN           = 'install_engagement_events';
const CART_METRIC            = 'cart_item_add_events';
const CHECKOUT_METRIC        = 'order_checkout_events';
const ORDER_METRIC           = 'order_placed_events';
const PRODUCT_DETAIL_METRIC  = 'product_detail_open_events';
const CART_UNIQUE_METRIC     = 'cart_item_add_unique_events';
const CHECKOUT_UNIQUE_METRIC = 'order_checkout_unique_events';
const ORDER_UNIQUE_METRIC    = 'order_placed_unique_events';
const PRODUCT_UNIQUE_METRIC  = 'product_detail_open_unique_events';

// dimensions=day only → accurate grand totals (includes organic, no suppression)
const DIMENSIONS_DAY  = ['day'];
const METRICS_BASE    = ['installs', 'clicks', 'impressions', 'cost'];

// dimensions=day,campaign → per-campaign breakdown + events
const DIMENSIONS_CAMP = ['day', 'campaign'];
const METRICS_ALL     = [
  'installs', 'clicks', 'impressions', 'cost', ENGAGE_TOKEN,
  CART_METRIC, CHECKOUT_METRIC, ORDER_METRIC, PRODUCT_DETAIL_METRIC,
  CART_UNIQUE_METRIC, CHECKOUT_UNIQUE_METRIC, ORDER_UNIQUE_METRIC, PRODUCT_UNIQUE_METRIC,
];

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportRow {
  day?:                 string;
  campaign?:            string;
  campaign_id_network?: string;
  app_token?:           string;
  app?:                 string;
  installs?:            number;
  clicks?:              number;
  impressions?:         number;
  cost?:                number;
  [key: string]:        unknown;
}

interface ReportResponse {
  rows:      ReportRow[];
  totals?:   Record<string, unknown>;
  warnings?: unknown[];
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchReport(
  appTokens: string[],
  range: { start_date: string; end_date: string },
  dims: string[],
  metrics: string[],
): Promise<ReportResponse> {
  const parts: string[] = [];
  for (const t of appTokens) parts.push(`app_token[]=${encodeURIComponent(t)}`);
  parts.push(`date_period=${range.start_date}:${range.end_date}`);
  parts.push(`dimensions=${dims.join(',')}`);
  parts.push(`metrics=${metrics.join(',')}`);
  parts.push('limit=50000');
  const url = `${REPORT_URL}?${parts.join('&')}`;
  console.log('[Adjust] requesting:', url);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Adjust Report API HTTP ${res.status} | url=${url.slice(0, 300)} | body=${body.slice(0, 300)}`);
  }
  return res.json() as Promise<ReportResponse>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEngagement(r: ReportRow): number {
  return Number(r[ENGAGE_TOKEN] ?? 0);
}

function mapRow(r: ReportRow): AdjustDailyRow {
  return {
    date:          r.day          ?? '',
    appToken:      r.app_token    ?? '',
    appName:       r.app          ?? r.app_token ?? '',
    campaignToken: r.campaign_id_network ?? r.campaign ?? '',
    campaignName:  r.campaign     ?? '',
    installs:      Number(r.installs    ?? 0),
    clicks:        Number(r.clicks      ?? 0),
    impressions:   Number(r.impressions ?? 0),
    cost:          Number(r.cost        ?? 0),
    sessions:      0,
    engagement:    extractEngagement(r),
    cartAdd:              Number(r[CART_METRIC]            ?? 0),
    checkout:             Number(r[CHECKOUT_METRIC]        ?? 0),
    orderPlace:           Number(r[ORDER_METRIC]           ?? 0),
    productDetailOpen:    Number(r[PRODUCT_DETAIL_METRIC]  ?? 0),
    cartAddUnique:        Number(r[CART_UNIQUE_METRIC]     ?? 0),
    checkoutUnique:       Number(r[CHECKOUT_UNIQUE_METRIC] ?? 0),
    orderPlaceUnique:     Number(r[ORDER_UNIQUE_METRIC]    ?? 0),
    productDetailOpenUnique: Number(r[PRODUCT_UNIQUE_METRIC] ?? 0),
    timeSpent:  0,
  };
}

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

const ZERO_SUM: RowSum = {
  installs: 0, clicks: 0, impressions: 0, cost: 0, engagement: 0,
  cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0,
  productDetailOpen: 0, cartAddUnique: 0, checkoutUnique: 0,
  orderPlaceUnique: 0, productDetailOpenUnique: 0,
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
    { ...ZERO_SUM },
  );
}

// Sum the day-level report rows (no campaign field) for accurate totals
function sumDayRows(rows: ReportRow[], todayStr: string): Pick<RowSum, 'installs' | 'clicks' | 'impressions' | 'cost'> {
  let installs = 0, clicks = 0, impressions = 0, cost = 0;
  for (const r of rows) {
    if ((r.day ?? '') >= todayStr) continue;
    installs    += Number(r.installs    ?? 0);
    clicks      += Number(r.clicks      ?? 0);
    impressions += Number(r.impressions ?? 0);
    cost        += Number(r.cost        ?? 0);
  }
  return { installs, clicks, impressions, cost };
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

      // Four concurrent calls:
      // • dayRep      — dimensions=day: accurate grand totals including organic installs
      // • campRep     — dimensions=day,campaign: per-campaign breakdown + event metrics
      // • prevDayRep  — same as dayRep but for prev period
      // • prevCampRep — same as campRep but for prev period
      const [dayRep, campRep, prevDayRep, prevCampRep] = await Promise.all([
        fetchReport(APP_TOKENS, range,     DIMENSIONS_DAY,  METRICS_BASE),
        fetchReport(APP_TOKENS, range,     DIMENSIONS_CAMP, METRICS_ALL),
        fetchReport(APP_TOKENS, prevRange, DIMENSIONS_DAY,  METRICS_BASE),
        fetchReport(APP_TOKENS, prevRange, DIMENSIONS_CAMP, METRICS_ALL),
      ]);

      const filterRow = (r: ReportRow) => (r.day ?? '') < todayStr;

      const daily    = (campRep.rows     ?? []).filter(filterRow).map(mapRow);
      const prevDail = (prevCampRep.rows ?? []).filter(filterRow).map(mapRow);

      // ── Campaigns ────────────────────────────────────────────────────────────
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
      // Use day-level (no campaign dimension) for installs/clicks/impressions/cost:
      // this captures organic installs and avoids any campaign-level suppression,
      // matching what the Adjust UI reports. Events stay from campaign-level sum.
      const dayBase     = sumDayRows(dayRep.rows     ?? [], todayStr);
      const prevDayBase = sumDayRows(prevDayRep.rows ?? [], todayStr);
      const campSum     = sumRows(daily);
      const prevCampSum = sumRows(prevDail);

      const totals = deriveTotals({
        ...campSum,
        installs:    dayBase.installs,
        clicks:      dayBase.clicks,
        impressions: dayBase.impressions,
        cost:        dayBase.cost,
      });

      const prevBaseTotal = {
        ...prevCampSum,
        installs:    prevDayBase.installs,
        clicks:      prevDayBase.clicks,
        impressions: prevDayBase.impressions,
        cost:        prevDayBase.cost,
      };
      const prevTotals = prevBaseTotal.installs > 0 || prevBaseTotal.cost > 0
        ? deriveTotals(prevBaseTotal)
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
      const noncampPrevInstalls    = Math.max(0, prevDayBase.installs    - paidPrevSum.installs);
      const noncampPrevEngagement  = Math.max(0, prevCampSum.engagement  - paidPrevSum.engagement);
      const noncampPrevClicks      = Math.max(0, prevDayBase.clicks      - paidPrevSum.clicks);
      const noncampPrevImpressions = Math.max(0, prevDayBase.impressions - paidPrevSum.impressions);
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
