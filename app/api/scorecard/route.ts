import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';

const TTL = 5 * 60 * 1000; // 5 min

const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN!;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;
const API_VER            = 'v21.0';
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

const fmt = (d: Date) => d.toISOString().split('T')[0];

function getCurrentRange(preset: string): { since: string; until: string } {
  if (preset === 'since_dec_1') {
    return { since: '2025-12-01', until: fmt(new Date()) };
  }
  const days  = getPeriodDays(preset);
  const today = new Date();
  const since = new Date(today); since.setDate(today.getDate() - days);
  return { since: fmt(since), until: fmt(today) };
}

function getPreviousRange(preset: string): { since: string; until: string } {
  if (preset === 'since_dec_1') {
    const today = new Date();
    const dec1 = new Date('2025-12-01');
    const durationMs = today.getTime() - dec1.getTime();
    const prevStart = new Date(dec1.getTime() - durationMs);
    return { since: fmt(prevStart), until: '2025-11-30' };
  }
  const days  = getPeriodDays(preset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const until = new Date(today); until.setDate(today.getDate() - days);
  const since = new Date(until); since.setDate(until.getDate() - days);
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
  creative?: { id?: string; object_type?: string; video_id?: string };
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
  const cacheKey   = `scorecard:${META_AD_ACCOUNT_ID}:${datePreset}`;

  const insightFields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas';

  try {
    const payload = await withCache(cacheKey, TTL, async () => {
    const currRange = getCurrentRange(datePreset);
    const prevRange = getPreviousRange(datePreset);

    // ── Parallel fetches ─────────────────────────────────────────────────────
    const [currentRes, previousRes, adsData] = await Promise.all([
      // 1. Account insights — current period (explicit range including today)
      fetch(`${BASE}/insights?${new URLSearchParams({
        fields: insightFields, time_range: JSON.stringify(currRange), access_token: META_ACCESS_TOKEN,
      })}`).then(r => r.json()),

      // 2. Account insights — previous period
      fetch(`${BASE}/insights?${new URLSearchParams({
        fields: insightFields, time_range: JSON.stringify(prevRange), access_token: META_ACCESS_TOKEN,
      })}`).then(r => r.json()),

      // 3. ACTIVE ads only — server-side filter reduces 3000 → ~200 records
      fetchAll<AdRow>(
        `${BASE}/ads?${new URLSearchParams({
          fields: [
            'name', 'status', 'created_time',
            'creative{id,object_type,video_id}',
            datePreset === 'since_dec_1'
              ? `insights.time_range({"since":"2025-12-01","until":"${fmt(new Date())}"}){spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas,video_play_actions,video_thruplay_watched_actions}`
              : `insights.date_preset(${datePreset}){spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas,video_play_actions,video_thruplay_watched_actions}`,
          ].join(','),
          effective_status: JSON.stringify(['ACTIVE', 'PAUSED']), // skip deleted/archived
          limit: '200',
          access_token: META_ACCESS_TOKEN,
        })}`,
        3, // maxPages: 3×200 = 600 ads max (was 6×500 = 3000)
      ),
    ]);

    // ── Parse account-level metrics ──────────────────────────────────────────
    const curr = parseInsight(currentRes.data?.[0] ?? {});
    const prev = parseInsight(previousRes.data?.[0] ?? {});

    // ── Creative-level analysis (deduplicated by creative.id) ────────────────
    // Only consider ACTIVE ads for all creative metrics
    const activeAdsWithInsights = adsData.filter(
      a => a.status === 'ACTIVE' && a.insights?.data?.[0],
    );

    // ── 1. Aggregate ads by creative.id ──────────────────────────────────────
    interface CreativeAgg {
      creativeId: string;
      objectType: string;
      hasVideoId: boolean;
      oldestCreatedTime: string;
      totalSpend: number;
      totalConvValue: number;
      totalImpressions: number;
      totalVideoPlays: number;
      totalThruPlays: number;
    }

    const creativeMap = new Map<string, CreativeAgg>();

    for (const ad of activeAdsWithInsights) {
      const cId = ad.creative?.id ?? ad.id; // fallback to ad.id if no creative.id
      const ins = ad.insights!.data[0];
      const spend       = parseFloat(ins.spend || '0');
      const convVal     = pickPurchase(ins.action_values);
      const impressions = parseInt(ins.impressions || '0', 10);
      const videoPlays  = ins.video_play_actions
        ? parseInt(ins.video_play_actions.find(a => a.action_type === 'video_view')?.value || '0', 10)
        : 0;
      const thruPlays   = ins.video_thruplay_watched_actions
        ? parseInt(ins.video_thruplay_watched_actions.find(a => a.action_type === 'video_view')?.value || '0', 10)
        : 0;

      const existing = creativeMap.get(cId);
      if (existing) {
        existing.totalSpend       += spend;
        existing.totalConvValue   += convVal;
        existing.totalImpressions += impressions;
        existing.totalVideoPlays  += videoPlays;
        existing.totalThruPlays   += thruPlays;
        // Keep oldest created_time
        if (ad.created_time < existing.oldestCreatedTime) {
          existing.oldestCreatedTime = ad.created_time;
        }
      } else {
        creativeMap.set(cId, {
          creativeId: cId,
          objectType: ad.creative?.object_type?.toUpperCase() ?? '',
          hasVideoId: !!ad.creative?.video_id,
          oldestCreatedTime: ad.created_time || '',
          totalSpend: spend,
          totalConvValue: convVal,
          totalImpressions: impressions,
          totalVideoPlays: videoPlays,
          totalThruPlays: thruPlays,
        });
      }
    }

    const creatives = Array.from(creativeMap.values());

    // ── 2. Format mix (unique creatives) ─────────────────────────────────────
    let videoCount  = 0;
    let staticCount = 0;
    let otherCount  = 0;
    const now = Date.now();
    let totalAgeDays = 0;
    let ageCount     = 0;

    for (const cr of creatives) {
      if (cr.hasVideoId || cr.objectType.includes('VIDEO')) videoCount++;
      else if (['IMAGE', 'LINK', 'SHARE'].includes(cr.objectType)) staticCount++;
      else otherCount++;

      if (cr.oldestCreatedTime) {
        const age = (now - new Date(cr.oldestCreatedTime).getTime()) / (1000 * 60 * 60 * 24);
        if (age > 0 && age < 365) { // sanity check
          totalAgeDays += age;
          ageCount++;
        }
      }
    }

    const avgAgeDays = ageCount > 0 ? Math.round(totalAgeDays / ageCount) : 0;

    // ── 3. Win rate & spend concentration (by creative) ──────────────────────
    let totalSpend = 0;
    let winnersCount = 0;
    const creativeSpends: number[] = [];

    for (const cr of creatives) {
      totalSpend += cr.totalSpend;
      creativeSpends.push(cr.totalSpend);
      const crRoas = cr.totalSpend > 0 ? cr.totalConvValue / cr.totalSpend : 0;
      if (crRoas > curr.roas && cr.totalSpend > 0) winnersCount++;
    }

    const winRate = creatives.length > 0
      ? (winnersCount / creatives.length) * 100
      : 0;

    // Top creative % of total spend
    creativeSpends.sort((a, b) => b - a);
    const topCreativeSpendPct = totalSpend > 0 && creativeSpends.length > 0
      ? (creativeSpends[0] / totalSpend) * 100
      : 0;

    // ── 4. Hook rate & hold rate (weighted by impressions) ───────────────────
    let totalVideoImpressions = 0;
    let weightedVideoPlays    = 0;
    let weightedThruPlays     = 0;
    let totalVideoPlaysForHold = 0;

    for (const cr of creatives) {
      if (!(cr.hasVideoId || cr.objectType.includes('VIDEO'))) continue;
      if (cr.totalImpressions <= 0) continue;

      totalVideoImpressions += cr.totalImpressions;
      weightedVideoPlays    += cr.totalVideoPlays;

      if (cr.totalVideoPlays > 0) {
        weightedThruPlays     += cr.totalThruPlays;
        totalVideoPlaysForHold += cr.totalVideoPlays;
      }
    }

    const avgHookRate = totalVideoImpressions > 0
      ? (weightedVideoPlays / totalVideoImpressions) * 100
      : 0;
    const avgHoldRate = totalVideoPlaysForHold > 0
      ? (weightedThruPlays / totalVideoPlaysForHold) * 100
      : 0;

    // CVR
    const currCVR = curr.clicks > 0 ? (curr.conversions / curr.clicks) * 100 : 0;
    const prevCVR = prev.clicks > 0 ? (prev.conversions / prev.clicks) * 100 : 0;

    // ── Build response payload ───────────────────────────────────────────────
    return {
      datePreset,
      current: curr,
      previous: prev,
      creatives: {
        activeCount: creatives.length,
        totalAds: activeAdsWithInsights.length,
        videoCount,
        staticCount,
        otherCount,
        avgAgeDays,
        winRate,
        topCreativeSpendPct,
        avgHookRate,
        avgHoldRate,
      },
      derived: { currCVR, prevCVR },
      fetchedAt: new Date().toISOString(),
    };
    }); // end withCache

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' },
    });

  } catch (err) {
    return NextResponse.json(
      { error: `Erreur: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
