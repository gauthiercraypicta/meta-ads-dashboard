import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { ActionData } from '@/types/meta';
import type { AppDailyRow, AppCampaignSummary, AppTotals, AppInstallsResponse } from '@/types/app';

const API_VERSION = 'v21.0';
const BASE_URL    = `https://graph.facebook.com/${API_VERSION}`;
const TTL         = 5 * 60 * 1000;

// ─── Config ───────────────────────────────────────────────────────────────────
// Set QUALIFIED_INSTALL_EVENT in Vercel env vars (e.g. "app_custom_event.fb_mobile_activate_app")
const QUALIFIED_INSTALL_EVENT =
  process.env.QUALIFIED_INSTALL_EVENT ?? 'app_custom_event.fb_mobile_activate_app';

const APP_OBJECTIVES = ['OUTCOME_APP_PROMOTION', 'APP_INSTALLS'];

const INSIGHT_FIELDS =
  'date_start,campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,clicks,ctr,cpm,cpc,frequency,actions,action_values';

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
      // 1. Fetch app campaigns (filter by objective)
      const campParams = new URLSearchParams({
        fields:     'id,name,status,objective',
        filtering:  JSON.stringify([{ field: 'objective', operator: 'IN', value: APP_OBJECTIVES }]),
        access_token: META_ACCESS_TOKEN!,
        limit:      '200',
      });
      const campaigns = await fetchAllPages<{ id: string; name: string; status: string }>(
        `${BASE_URL}/${META_AD_ACCOUNT_ID}/campaigns?${campParams}`,
      );

      console.log(`[app-installs] Found ${campaigns.length} app campaign(s)`);

      if (!campaigns.length) {
        const empty = computeTotals([]);
        return { daily: [], campaigns: [], totals: empty, prevTotals: null, qualifiedInstallEvent: QUALIFIED_INSTALL_EVENT };
      }

      const appCampIds = new Set(campaigns.map((c) => c.id));
      const campMeta   = new Map(campaigns.map((c) => [c.id, { name: c.name, status: c.status }]));

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

      const [currentRaw, prevRaw] = await Promise.all([
        fetchAllPages<Record<string, unknown>>(insightUrl(currentRange)),
        fetchAllPages<Record<string, unknown>>(insightUrl(prevRange)),
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
          id, name: campMeta.get(id)?.name ?? id, status: campMeta.get(id)?.status ?? 'UNKNOWN',
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

      return {
        daily:     currentDaily,
        campaigns: campaignSummaries,
        totals:    computeTotals(currentDaily),
        prevTotals: prevDaily.length > 0 ? computeTotals(prevDaily) : null,
        qualifiedInstallEvent: QUALIFIED_INSTALL_EVENT,
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
