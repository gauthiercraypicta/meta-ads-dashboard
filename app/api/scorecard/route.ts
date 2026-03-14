import { NextResponse } from 'next/server';

const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN!;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;
const API_VER            = 'v18.0';
const BASE               = `https://graph.facebook.com/${API_VER}/${META_AD_ACCOUNT_ID}`;

// ── Purchase extraction (same priority as metaHelpers) ───────────────────────
const PURCHASE_PRIORITY = [
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
];

interface Action { action_type: string; value: string }

function pickPurchase(actions: Action[] | undefined): number {
  if (!actions) return 0;
  for (const type of PURCHASE_PRIORITY) {
    const m = actions.find((a) => a.action_type === type);
    if (m) return parseFloat(m.value || '0');
  }
  return 0;
}

// ── Date range helpers ───────────────────────────────────────────────────────
function getPeriodDays(preset: string): number {
  switch (preset) {
    case 'last_7d':  return 7;
    case 'last_30d': return 30;
    case 'last_90d': return 90;
    default:         return 30;
  }
}

function getPreviousRange(preset: string): { since: string; until: string } {
  const days  = getPeriodDays(preset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const until = new Date(today); until.setDate(today.getDate() - days);
  const since = new Date(until); since.setDate(until.getDate() - days);
  const fmt   = (d: Date) => d.toISOString().split('T')[0];
  return { since: fmt(since), until: fmt(until) };
}

// ── Paginated fetch ──────────────────────────────────────────────────────────
async function fetchAll<T>(url: string, maxPages = 5): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = url;
  let p = 0;
  while (next && p < maxPages) {
    const res  = await fetch(next, { next: { revalidate: 120 } });
    const data = await res.json() as { data?: T[]; paging?: { next?: string } };
    if (data.data) results.push(...data.data);
    next = data.paging?.next ?? null;
    p++;
  }
  return results;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface InsightRow {
  spend: string; impressions: string; reach: string; clicks: string;
  ctr: string; cpc: string; cpm: string; frequency: string;
  actions?: Action[]; action_values?: Action[];
}

interface AdRow {
  id: string; name: string; status: string; created_time: string;
  creative?: { object_type?: string; video_id?: string };
  insights?: { data: (InsightRow & {
    video_play_actions?: Action[];
    video_thruplay_watched_actions?: Action[];
  })[] };
}

interface Metrics {
  spend: number; impressions: number; reach: number; clicks: number;
  ctr: number; cpc: number; cpm: number; frequency: number;
  conversions: number; conversionValue: number; roas: number; cpa: number;
}

function parseInsight(d: InsightRow): Metrics {
  const spend       = parseFloat(d.spend || '0');
  const impressions = parseInt(d.impressions || '0', 10);
  const reach       = parseInt(d.reach || '0', 10);
  const clicks      = parseInt(d.clicks || '0', 10);
  const conversions     = pickPurchase(d.actions);
  const conversionValue = pickPurchase(d.action_values);
  const roas = spend > 0 && conversionValue > 0 ? conversionValue / spend : 0;
  const cpa  = conversions > 0 ? spend / conversions : 0;
  return {
    spend, impressions, reach, clicks,
    ctr: parseFloat(d.ctr || '0'),
    cpc: parseFloat(d.cpc || '0'),
    cpm: parseFloat(d.cpm || '0'),
    frequency: parseFloat(d.frequency || '0'),
    conversions, conversionValue, roas, cpa,
  };
}

// ── Route ────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Meta API credentials missing' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';
  const prevRange  = getPreviousRange(datePreset);

  const insightFields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas';

  try {
    // ── Parallel fetches ─────────────────────────────────────────────────────
    const [currentRes, previousRes, adsData] = await Promise.all([
      // 1. Account insights — current period
      fetch(`${BASE}/insights?${new URLSearchParams({
        fields: insightFields, date_preset: datePreset, access_token: META_ACCESS_TOKEN,
      })}`, { next: { revalidate: 120 } }).then(r => r.json()),

      // 2. Account insights — previous period
      fetch(`${BASE}/insights?${new URLSearchParams({
        fields: insightFields, time_range: JSON.stringify(prevRange), access_token: META_ACCESS_TOKEN,
      })}`, { next: { revalidate: 120 } }).then(r => r.json()),

      // 3. Ads with creative data + insights (for creative metrics)
      fetchAll<AdRow>(
        `${BASE}/ads?${new URLSearchParams({
          fields: [
            'name', 'status', 'created_time',
            'creative{object_type,video_id}',
            `insights.date_preset(${datePreset}){spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas,video_play_actions,video_thruplay_watched_actions}`,
          ].join(','),
          limit: '200',
          access_token: META_ACCESS_TOKEN,
        })}`,
        3,
      ),
    ]);

    // ── Parse account-level metrics ──────────────────────────────────────────
    const curr = parseInsight(currentRes.data?.[0] ?? {});
    const prev = parseInsight(previousRes.data?.[0] ?? {});

    // ── Creative-level analysis ──────────────────────────────────────────────
    const activeAds = adsData.filter(a => a.status === 'ACTIVE');
    const adsWithInsights = adsData.filter(a => a.insights?.data?.[0]);

    // Format mix
    let videoCount  = 0;
    let staticCount = 0;
    let otherCount  = 0;
    const now = Date.now();
    let totalAgeDays = 0;
    let ageCount     = 0;

    for (const ad of activeAds) {
      const objType = ad.creative?.object_type?.toUpperCase() ?? '';
      if (ad.creative?.video_id || objType.includes('VIDEO')) videoCount++;
      else if (objType === 'IMAGE' || objType === 'LINK' || objType === 'SHARE') staticCount++;
      else otherCount++;

      if (ad.created_time) {
        const age = (now - new Date(ad.created_time).getTime()) / (1000 * 60 * 60 * 24);
        totalAgeDays += age;
        ageCount++;
      }
    }

    const avgAgeDays = ageCount > 0 ? Math.round(totalAgeDays / ageCount) : 0;

    // Win rate & spend concentration
    let totalSpend = 0;
    let maxAdSpend = 0;
    let winnersCount = 0;
    const adSpends: number[] = [];

    for (const ad of adsWithInsights) {
      const ins = ad.insights!.data[0];
      const spend = parseFloat(ins.spend || '0');
      const convVal = pickPurchase(ins.action_values);
      const adRoas = spend > 0 ? convVal / spend : 0;
      totalSpend += spend;
      adSpends.push(spend);
      if (spend > maxAdSpend) maxAdSpend = spend;
      if (adRoas > curr.roas && spend > 0) winnersCount++;
    }

    const winRate = adsWithInsights.length > 0
      ? (winnersCount / adsWithInsights.length) * 100
      : 0;

    // Top creative % of spend
    adSpends.sort((a, b) => b - a);
    const topCreativeSpendPct = totalSpend > 0 && adSpends.length > 0
      ? (adSpends[0] / totalSpend) * 100
      : 0;

    // Hook rate & hold rate (video ads only)
    let hookRateSum = 0;
    let holdRateSum = 0;
    let videoAdsCount = 0;

    for (const ad of adsWithInsights) {
      const objType = ad.creative?.object_type?.toUpperCase() ?? '';
      if (!(ad.creative?.video_id || objType.includes('VIDEO'))) continue;

      const ins = ad.insights!.data[0];
      const impressions = parseInt(ins.impressions || '0', 10);
      const videoPlays = ins.video_play_actions
        ? parseInt(ins.video_play_actions.find(a => a.action_type === 'video_view')?.value || '0', 10)
        : 0;
      const thruPlays = ins.video_thruplay_watched_actions
        ? parseInt(ins.video_thruplay_watched_actions.find(a => a.action_type === 'video_view')?.value || '0', 10)
        : 0;

      if (impressions > 0 && videoPlays > 0) {
        hookRateSum += (videoPlays / impressions) * 100;
        if (thruPlays > 0) holdRateSum += (thruPlays / videoPlays) * 100;
        videoAdsCount++;
      }
    }

    const avgHookRate = videoAdsCount > 0 ? hookRateSum / videoAdsCount : 0;
    const avgHoldRate = videoAdsCount > 0 ? holdRateSum / videoAdsCount : 0;

    // CVR
    const currCVR = curr.clicks > 0 ? (curr.conversions / curr.clicks) * 100 : 0;
    const prevCVR = prev.clicks > 0 ? (prev.conversions / prev.clicks) * 100 : 0;

    // ── Build response ───────────────────────────────────────────────────────
    return NextResponse.json({
      datePreset,
      current: curr,
      previous: prev,
      creatives: {
        activeCount: activeAds.length,
        totalWithData: adsWithInsights.length,
        videoCount,
        staticCount,
        otherCount,
        avgAgeDays,
        winRate,
        topCreativeSpendPct,
        avgHookRate,
        avgHoldRate,
      },
      derived: {
        currCVR,
        prevCVR,
      },
      fetchedAt: new Date().toISOString(),
    });

  } catch (err) {
    return NextResponse.json(
      { error: `Erreur: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
