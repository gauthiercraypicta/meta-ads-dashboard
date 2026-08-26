import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { AdjustDailyRow, AdjustCampaignSummary, AdjustTotals, AdjustResponse } from '@/types/adjust';

const TTL        = 30 * 60 * 1000;
const REPORT_URL = 'https://dash.adjust.com/control-center/reports-service/report';

// install_engagement metric ID from filters_data — belongs in metrics= not event_kpis[]
const ENGAGE_TOKEN = 'install_engagement_events';

// Adjust Reports Service uses "{event_name}_events" metric IDs, not 6-char tokens
const CART_METRIC              = 'cart_item_add_events';
const CHECKOUT_METRIC          = 'order_checkout_events';
const ORDER_METRIC             = 'order_placed_events';
const PRODUCT_DETAIL_METRIC    = 'product_detail_open_events';
const CART_UNIQUE_METRIC       = 'cart_item_add_unique_events';
const CHECKOUT_UNIQUE_METRIC   = 'order_checkout_unique_events';
const ORDER_UNIQUE_METRIC      = 'order_placed_unique_events';
const PRODUCT_UNIQUE_METRIC    = 'product_detail_open_unique_events';

// Main dimensions — no campaign_id_network. Without it, Adjust doesn't split
// rows by (campaign, network_id) pairs, so small-cell privacy suppression
// cannot zero out installs. Campaign install counts and daily rows match the
// Adjust UI. app_token must stay so filterRow can isolate the right app.
const DIMENSIONS = ['day', 'app', 'app_token', 'campaign'];

// IDs-only call — same period, adds campaign_id_network. Used exclusively to
// build the campaign-name → Meta-network-ID mapping so campaignToken in the
// returned daily rows carries the numeric Meta campaign ID (needed for the
// Adjust vs Meta comparison chart and for daily spend enrichment by ID).
const DIMENSIONS_IDS = ['day', 'app', 'app_token', 'campaign', 'campaign_id_network'];
const METRICS    = [
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

// ─── Adjust Report Service types ──────────────────────────────────────────────

interface ReportRow {
  day?:                 string;
  app?:                 string;
  app_token?:           string;
  campaign?:            string;
  campaign_id_network?: string;
  os_name?:             string;
  installs?:            number;
  clicks?:              number;
  impressions?:         number;
  cost?:                number;
  [key: string]:        unknown;   // event metrics (e.g. citg8a)
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
  dims: string[] = DIMENSIONS,
): Promise<ReportResponse> {
  const parts: string[] = [];
  for (const t of appTokens) parts.push(`app_token[]=${encodeURIComponent(t)}`);
  parts.push(`date_period=${range.start_date}:${range.end_date}`);
  parts.push(`dimensions=${dims.join(',')}`);
  parts.push(`metrics=${METRICS.join(',')}`);
  // event_kpis[] is silently ignored by Adjust — metric id goes in metrics= directly
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEngagement(r: ReportRow): number {
  // Key in response rows matches the event_kpis[] id: install_engagement_events
  return Number(r[ENGAGE_TOKEN] ?? 0);
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

function mapRow(r: ReportRow): AdjustDailyRow {
  return {
    date:          r.day          ?? '',
    appToken:      r.app_token    ?? '',
    appName:       r.app          ?? r.app_token ?? '',
    campaignToken: r.campaign_id_network ?? r.campaign ?? '',
    campaignName:  r.campaign     ?? '',
    installs:      Number(r.installs        ?? 0),
    clicks:        Number(r.clicks          ?? 0),
    impressions:   Number(r.impressions     ?? 0),
    cost:          Number(r.cost            ?? 0),
    sessions:      0,
    engagement:    extractEngagement(r),
    cartAdd:              Number(r[CART_METRIC]           ?? 0),
    checkout:             Number(r[CHECKOUT_METRIC]       ?? 0),
    orderPlace:           Number(r[ORDER_METRIC]          ?? 0),
    productDetailOpen:    Number(r[PRODUCT_DETAIL_METRIC] ?? 0),
    cartAddUnique:        Number(r[CART_UNIQUE_METRIC]    ?? 0),
    checkoutUnique:       Number(r[CHECKOUT_UNIQUE_METRIC] ?? 0),
    orderPlaceUnique:     Number(r[ORDER_UNIQUE_METRIC]   ?? 0),
    productDetailOpenUnique: Number(r[PRODUCT_UNIQUE_METRIC] ?? 0),
    timeSpent:  0,
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

      // Three concurrent calls:
      // • curr    — no campaign_id_network: accurate install counts per campaign/day
      // • currIds — with campaign_id_network: only for building campaign-name→ID map
      // • prev    — previous period (same dims as curr)
      const [curr, currIds, prev] = await Promise.all([
        fetchReport(APP_TOKENS, range,     DIMENSIONS),
        fetchReport(APP_TOKENS, range,     DIMENSIONS_IDS),
        fetchReport(APP_TOKENS, prevRange, DIMENSIONS),
      ]);

      const appTokenSet = new Set(APP_TOKENS);
      const todayStr    = fmt(new Date());

      const filterRow = (r: ReportRow) =>
        (!r.app_token || appTokenSet.has(r.app_token)) && (r.day ?? '') < todayStr;

      // Build campaign-name → network-ID map from the IDs call (first occurrence wins)
      const idByName = new Map<string, string>();
      for (const r of currIds.rows ?? []) {
        const name = r.campaign;
        const nid  = r.campaign_id_network;
        if (name && nid && !idByName.has(name)) idByName.set(name, nid);
      }

      // Map main rows, injecting the numeric Meta campaign ID into campaignToken
      // so downstream enrichment and the Adjust↔Meta comparison chart can match by ID
      const daily = (curr.rows ?? []).filter(filterRow).map(r => {
        const row = mapRow(r);
        const nid = idByName.get(row.campaignName);
        if (nid) row.campaignToken = nid;
        return row;
      });
      const prevDail = (prev.rows ?? []).filter(filterRow).map(mapRow);

      // ── Campaigns ────────────────────────────────────────────────────────────
      // Key by campaignName (stable) since campaignToken is now the injected
      // network ID and may differ from what the main call returns for the same
      // campaign — using name prevents accidental duplicate entries.
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

      // ── Totals: computed directly from daily rows (no campaign_id_network in
      // DIMENSIONS means no per-network-cell suppression, so the sum is accurate) ──
      const totals = deriveTotals(sumRows(daily));
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

      // noncamp: Adjust grand prev total minus rows that have cost (paid campaigns)
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
