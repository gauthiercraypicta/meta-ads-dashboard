import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { ActionData } from '@/types/meta';
import type { AppDailyRow, AppCampaignSummary, AppTotals, AppDeviceRow, AppVideoMetrics, AppInstallsResponse } from '@/types/app';

const API_VERSION = 'v21.0';
const BASE_URL    = `https://graph.facebook.com/${API_VERSION}`;
const TTL         = 5 * 60 * 1000;

// ─── Config ───────────────────────────────────────────────────────────────────
// Set QUALIFIED_INSTALL_EVENT in Vercel env vars (e.g. "app_custom_event.fb_mobile_activate_app")
const QUALIFIED_INSTALL_EVENT =
  process.env.QUALIFIED_INSTALL_EVENT ?? 'app_custom_event.fb_mobile_activate_app';

const APP_OBJECTIVES = ['OUTCOME_APP_PROMOTION', 'APP_INSTALLS'];

const INSIGHT_FIELDS =
  'date_start,campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,clicks,ctr,cpm,cpc,frequency,actions,action_values,' +
  'video_play_actions,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d: Date) => d.toISOString().split('T')[0];

function getTimeRange(datePreset: string): { since: string; until: string } {
  if (datePreset === 'since_dec_1') return { since: '2025-12-01', until: fmt(new Date()) };
  const days: Record<string, number> = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };
  const n = days[datePreset] ?? 30;
  const until = new Date();
  const since  = new Date();
  since.setDate(until.getDate() - n);
  return { since: fmt(since), until: fmt(until) };
}

function getPrevRange(curr: { since: string; until: string }): { since: string; until: string } {
  const sinceMs = new Date(curr.since).getTime();
  const untilMs = new Date(curr.until).getTime();
  const dur     = untilMs - sinceMs;
  const prevUntil = new Date(sinceMs - 86_400_000);
  const prevSince = new Date(prevUntil.getTime() - dur);
  return { since: fmt(prevSince), until: fmt(prevUntil) };
}

function actionVal(actions: ActionData[] | undefined, type: string): number {
  return parseFloat(actions?.find((a) => a.action_type === type)?.value ?? '0') || 0;
}

function videoVal(field: unknown): number {
  const arr = field as ActionData[] | undefined;
  return parseFloat(arr?.find((a) => a.action_type === 'video_view')?.value ?? '0') || 0;
}

function extractInstalls(actions: ActionData[] | undefined): number {
  return actionVal(actions, 'mobile_app_install') || actionVal(actions, 'omni_app_install');
}

async function fetchAllPages<T>(url: string, maxPages = 10): Promise<T[]> {
  const results: T[] = [];
  let next: string | undefined = url;
  let page = 0;
  while (next && page < maxPages) {
    const res: Response = await fetch(next, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`Meta: ${data.error.message} (code ${data.error.code})`);
    if (data.data) results.push(...data.data);
    next = data.paging?.next;
    page++;
  }
  return results;
}

function computeTotals(rows: AppDailyRow[]): AppTotals {
  const s = rows.reduce(
    (acc, r) => ({
      spend:             acc.spend             + r.spend,
      impressions:       acc.impressions       + r.impressions,
      clicks:            acc.clicks            + r.clicks,
      installs:          acc.installs          + r.installs,
      qualifiedInstalls: acc.qualifiedInstalls + r.qualifiedInstalls,
    }),
    { spend: 0, impressions: 0, clicks: 0, installs: 0, qualifiedInstalls: 0 },
  );
  return {
    ...s,
    cpi:         s.installs          > 0 ? s.spend / s.installs          : 0,
    cpqi:        s.qualifiedInstalls > 0 ? s.spend / s.qualifiedInstalls : 0,
    cpm:         s.impressions       > 0 ? (s.spend / s.impressions) * 1000 : 0,
    ctr:         s.impressions       > 0 ? s.clicks / s.impressions       : 0,
    cpc:         s.clicks            > 0 ? s.spend / s.clicks             : 0,
    installRate: s.clicks            > 0 ? s.installs / s.clicks          : 0,
    qualRate:    s.installs          > 0 ? s.qualifiedInstalls / s.installs : 0,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
  const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN;

  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Identifiants Meta API manquants.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';
  const cacheKey   = `app-installs:${META_AD_ACCOUNT_ID}:${datePreset}`;

  try {
    const data = await withCache<AppInstallsResponse>(cacheKey, TTL, async () => {
      // 1. Fetch app campaigns (filter by objective) + targeting for OS detection
      const campParams = new URLSearchParams({
        fields:     'id,name,status,objective,targeting',
        filtering:  JSON.stringify([{ field: 'objective', operator: 'IN', value: APP_OBJECTIVES }]),
        access_token: META_ACCESS_TOKEN!,
        limit:      '200',
      });
      const campaigns = await fetchAllPages<{ id: string; name: string; status: string; targeting?: { user_os?: string[] } }>(
        `${BASE_URL}/${META_AD_ACCOUNT_ID}/campaigns?${campParams}`,
      );

      console.log(`[app-installs] Found ${campaigns.length} app campaign(s)`);
      campaigns.forEach((c) => console.log(`[app-installs] Campaign "${c.name}" user_os=${JSON.stringify(c.targeting?.user_os ?? [])}`));

      if (!campaigns.length) {
        const empty = computeTotals([]);
        return { daily: [], campaigns: [], totals: empty, prevTotals: null, qualifiedInstallEvent: QUALIFIED_INSTALL_EVENT, breakdown: [], videoMetrics: [] };
      }

      const detectCampOs = (c: { targeting?: { user_os?: string[] }; name: string }): string => {
        const userOs = (c.targeting?.user_os ?? []).map((s) => s.toLowerCase());
        const hasIos     = userOs.some((s) => s.includes('ios'));
        const hasAndroid = userOs.some((s) => s.includes('android'));
        if (hasIos && hasAndroid) return 'both';
        if (hasIos)               return 'ios';
        if (hasAndroid)           return 'android';
        // Fallback to campaign name keywords
        if (/\bios\b|iphone|ipad/i.test(c.name))  return 'ios';
        if (/android/i.test(c.name))               return 'android';
        return 'both'; // unknown → show in both tabs
      };

      const appCampIds = new Set(campaigns.map((c) => c.id));
      const campMeta   = new Map(campaigns.map((c) => [c.id, { name: c.name, status: c.status, os: detectCampOs(c) }]));

      // 2. Fetch daily insights — current + previous period in parallel
      const currentRange = getTimeRange(datePreset);
      const prevRange    = getPrevRange(currentRange);

      const insightUrl = (range: { since: string; until: string }) => {
        const p = new URLSearchParams({
          level:          'campaign',
          time_increment: '1',
          fields:         INSIGHT_FIELDS,
          time_range:     JSON.stringify(range),
          access_token:   META_ACCESS_TOKEN!,
          limit:          '500',
        });
        return `${BASE_URL}/${META_AD_ACCOUNT_ID}/insights?${p}`;
      };

      const breakdownUrl = (() => {
        const p = new URLSearchParams({
          level:          'campaign',
          time_increment: '1',
          breakdowns:     'impression_device',
          fields:         'date_start,campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',
          time_range:     JSON.stringify(currentRange),
          access_token:   META_ACCESS_TOKEN!,
          limit:          '500',
        });
        return `${BASE_URL}/${META_AD_ACCOUNT_ID}/insights?${p}`;
      })();

      const [currentRaw, prevRaw, breakdownRaw] = await Promise.all([
        fetchAllPages<Record<string, unknown>>(insightUrl(currentRange)),
        fetchAllPages<Record<string, unknown>>(insightUrl(prevRange)),
        fetchAllPages<Record<string, unknown>>(breakdownUrl),
      ]);

      // 3. Parse insight rows — filter to app campaigns only
      const parseRow = (row: Record<string, unknown>): AppDailyRow | null => {
        const campaignId = row.campaign_id as string;
        if (!appCampIds.has(campaignId)) return null;

        const actions  = row.actions as ActionData[] | undefined;
        const spend    = parseFloat(row.spend as string || '0') || 0;
        const impr     = parseInt(row.impressions as string || '0', 10) || 0;
        const reach    = parseInt(row.reach as string || '0', 10) || 0;
        const clicks   = parseInt(
          ((row.inline_link_clicks ?? row.clicks) as string) || '0', 10,
        ) || 0;
        const freq     = parseFloat(row.frequency as string || '0') || 0;
        const installs = extractInstalls(actions);
        const qi       = actionVal(actions, QUALIFIED_INSTALL_EVENT);

        console.log(
          `[app-installs] ${row.date_start} ${row.campaign_name}: spend=${spend.toFixed(2)} installs=${installs} qi=${qi}`,
        );

        return {
          date:              row.date_start as string,
          campaignId,
          campaignName:      campMeta.get(campaignId)?.name ?? (row.campaign_name as string) ?? campaignId,
          spend, impressions: impr, reach, clicks, frequency: freq,
          installs, qualifiedInstalls: qi,
        };
      };

      const currentDaily = currentRaw.map(parseRow).filter(Boolean) as AppDailyRow[];
      const prevDaily    = prevRaw.map(parseRow).filter(Boolean) as AppDailyRow[];

      // 3b. Parse device breakdown rows (impression_device)
      const parseBreakdownRow = (row: Record<string, unknown>): AppDeviceRow | null => {
        const campaignId = row.campaign_id as string;
        if (!appCampIds.has(campaignId)) return null;
        const actions  = row.actions as ActionData[] | undefined;
        const spend    = parseFloat(row.spend as string || '0') || 0;
        const impr     = parseInt(row.impressions as string || '0', 10) || 0;
        const clicks   = parseInt(row.clicks as string || '0', 10) || 0;
        const installs = extractInstalls(actions);
        const qi       = actionVal(actions, QUALIFIED_INSTALL_EVENT);
        return {
          date:         row.date_start as string,
          campaignId,
          campaignName: campMeta.get(campaignId)?.name ?? (row.campaign_name as string) ?? campaignId,
          device:       (row.impression_device as string) ?? 'unknown',
          spend, impressions: impr, clicks, installs, qualifiedInstalls: qi,
        };
      };

      const breakdown = breakdownRaw.map(parseBreakdownRow).filter(Boolean) as AppDeviceRow[];

      // 4. Build per-campaign summaries
      const campAgg = new Map<string, { spend: number; impressions: number; clicks: number; installs: number; qualifiedInstalls: number }>();
      for (const r of currentDaily) {
        const e = campAgg.get(r.campaignId);
        if (!e) {
          campAgg.set(r.campaignId, { spend: r.spend, impressions: r.impressions, clicks: r.clicks, installs: r.installs, qualifiedInstalls: r.qualifiedInstalls });
        } else {
          e.spend += r.spend; e.impressions += r.impressions; e.clicks += r.clicks;
          e.installs += r.installs; e.qualifiedInstalls += r.qualifiedInstalls;
        }
      }

      const campaignSummaries: AppCampaignSummary[] = Array.from(campAgg.entries())
        .map(([id, t]) => ({
          id, name: campMeta.get(id)?.name ?? id, status: campMeta.get(id)?.status ?? 'UNKNOWN', os: campMeta.get(id)?.os ?? 'both',
          ...t,
          cpi:         t.installs          > 0 ? t.spend / t.installs          : 0,
          cpqi:        t.qualifiedInstalls > 0 ? t.spend / t.qualifiedInstalls : 0,
          ctr:         t.impressions       > 0 ? t.clicks / t.impressions       : 0,
          cpm:         t.impressions       > 0 ? (t.spend / t.impressions) * 1000 : 0,
          cpc:         t.clicks            > 0 ? t.spend / t.clicks             : 0,
          installRate: t.clicks            > 0 ? t.installs / t.clicks          : 0,
          qualRate:    t.installs          > 0 ? t.qualifiedInstalls / t.installs : 0,
        }))
        .sort((a, b) => b.spend - a.spend);

      // 5. Aggregate video metrics per campaign from raw insight rows
      const videoAgg = new Map<string, { plays: number; weightedTime: number; p25: number; p50: number; p75: number; p100: number }>();
      for (const row of currentRaw) {
        const campaignId = row.campaign_id as string;
        if (!appCampIds.has(campaignId)) continue;
        const plays   = videoVal(row.video_play_actions);
        const avgTime = videoVal(row.video_avg_time_watched_actions);
        const p25     = videoVal(row.video_p25_watched_actions);
        const p50     = videoVal(row.video_p50_watched_actions);
        const p75     = videoVal(row.video_p75_watched_actions);
        const p100    = videoVal(row.video_p100_watched_actions);
        if (!plays) continue;
        const e = videoAgg.get(campaignId);
        if (!e) {
          videoAgg.set(campaignId, { plays, weightedTime: avgTime * plays, p25, p50, p75, p100 });
        } else {
          e.plays += plays; e.weightedTime += avgTime * plays;
          e.p25 += p25; e.p50 += p50; e.p75 += p75; e.p100 += p100;
        }
      }
      const videoMetrics: AppVideoMetrics[] = Array.from(videoAgg.entries())
        .map(([id, v]) => ({
          campaignId: id,
          campaignName: campMeta.get(id)?.name ?? id,
          os: campMeta.get(id)?.os ?? 'both',
          videoPlays: v.plays,
          avgTimeWatched: v.plays > 0 ? v.weightedTime / v.plays : 0,
          p25Rate: v.plays > 0 ? v.p25 / v.plays : 0,
          p50Rate: v.plays > 0 ? v.p50 / v.plays : 0,
          p75Rate: v.plays > 0 ? v.p75 / v.plays : 0,
          p100Rate: v.plays > 0 ? v.p100 / v.plays : 0,
        }))
        .filter((v) => v.videoPlays > 0)
        .sort((a, b) => b.avgTimeWatched - a.avgTimeWatched);

      return {
        daily:     currentDaily,
        campaigns: campaignSummaries,
        totals:    computeTotals(currentDaily),
        prevTotals: prevDaily.length > 0 ? computeTotals(prevDaily) : null,
        qualifiedInstallEvent: QUALIFIED_INSTALL_EVENT,
        breakdown,
        videoMetrics,
      };
    });

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[app-installs]', message);
    return NextResponse.json({ error: `Impossible de charger les données : ${message}` }, { status: 503 });
  }
}
