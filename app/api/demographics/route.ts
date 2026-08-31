import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { DemographicsResponse, DemoRow, PlatformSummary, AgePlatformRow } from '@/types/demographics';

const BASE    = 'https://graph.facebook.com/v21.0';
const TTL     = 20 * 60 * 1000;
const TOKEN   = process.env.META_ACCESS_TOKEN   ?? '';
const ACCOUNT = process.env.META_AD_ACCOUNT_ID  ?? '';

// Fixed window: campaigns since July 1 2026
const SINCE = '2026-07-01';

const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

const PLATFORM_LABEL: Record<string, string> = {
  facebook:         'Facebook',
  instagram:        'Instagram',
  audience_network: 'Audience Network',
  messenger:        'Messenger',
};

function action(
  actions: Array<{ action_type: string; value: string }> | undefined,
  ...types: string[]
): number {
  if (!actions) return 0;
  for (const t of types) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return Number(a.value);
  }
  return 0;
}

function extractProduct(name: string): string {
  const stripped = name.replace(/^picta[_\s]*/i, '');
  const parts = stripped.split('_').filter(Boolean);
  for (const p of parts) {
    const lo = p.toLowerCase();
    if (lo === 'ios')      return 'iOS';
    if (lo === 'android')  return 'Android';
    if (lo === 'landing')  return 'Landing';
    if (lo === 'web')      return 'Web';
    if (lo === 'cre' || lo === 'creative') return 'Creative';
  }
  return parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : name;
}

interface RawRow {
  campaign_name:      string;
  campaign_id:        string;
  age?:               string;
  gender?:            string;
  publisher_platform?: string;
  spend:              string;
  impressions:        string;
  clicks:             string;
  reach?:             string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface RawResponse {
  data?: RawRow[];
  paging?: { next?: string };
  error?: { message: string };
}

async function fetchAllPages(url: string): Promise<RawRow[]> {
  let rows: RawRow[] = [];
  let next: string | undefined = url;
  let page = 0;
  while (next && page < 8) {
    const res = await fetch(next);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Meta API ${res.status}: ${t.slice(0, 400)}`);
    }
    const json = await res.json() as RawResponse;
    if (json.error) throw new Error(json.error.message);
    rows = [...rows, ...(json.data ?? [])];
    next = json.paging?.next;
    page++;
  }
  return rows;
}

export async function GET() {
  if (!TOKEN || !ACCOUNT) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID manquants' }, { status: 503 });
  }

  try {
    const result = await withCache<DemographicsResponse>('demographics:jul2026', TTL, async () => {
      const today = new Date().toISOString().split('T')[0];

      const commonParams = {
        level:       'campaign',
        time_range:  JSON.stringify({ since: SINCE, until: today }),
        filtering:   JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: '0' }]),
        limit:       '5000',
        access_token: TOKEN,
      };

      // Three separate calls — Meta doesn't allow age+gender+publisher_platform combined.
      // age+publisher_platform (without gender) is valid and gives the age×platform cross.
      const [rawAgeGender, rawPlatform, rawAgePlatform] = await Promise.all([
        fetchAllPages(`${BASE}/${ACCOUNT}/insights?${new URLSearchParams({
          ...commonParams,
          fields:     'campaign_name,campaign_id,spend,impressions,clicks,reach,actions',
          breakdowns: 'age,gender',
        })}`),
        fetchAllPages(`${BASE}/${ACCOUNT}/insights?${new URLSearchParams({
          ...commonParams,
          fields:     'campaign_name,campaign_id,spend,impressions,clicks,actions',
          breakdowns: 'publisher_platform',
        })}`),
        fetchAllPages(`${BASE}/${ACCOUNT}/insights?${new URLSearchParams({
          ...commonParams,
          fields:     'campaign_name,campaign_id,spend,impressions,actions',
          breakdowns: 'age,publisher_platform',
        })}`),
      ]);

      // ── Age/gender rows ──────────────────────────────────────────────────────
      const rows: DemoRow[] = rawAgeGender.map((r) => {
        const spend       = Number(r.spend      ?? 0);
        const impressions = Number(r.impressions ?? 0);
        const clicks      = Number(r.clicks     ?? 0);
        const reach       = Number(r.reach      ?? 0);
        const installs    = action(r.actions, 'mobile_app_install', 'omni_app_install');
        const purchases   = action(r.actions, 'purchase', 'omni_purchase');
        const gender      = r.gender === 'male' ? 'Homme' : r.gender === 'female' ? 'Femme' : 'Autre';
        return {
          campaignId:   r.campaign_id,
          campaignName: r.campaign_name,
          product:      extractProduct(r.campaign_name),
          age:          r.age ?? '',
          gender,
          spend,
          impressions,
          clicks,
          reach,
          installs,
          purchases,
          cpi:  installs    > 0 ? spend / installs    : 0,
          cpp:  purchases   > 0 ? spend / purchases   : 0,
          ctr:  impressions > 0 ? clicks / impressions : 0,
          cpm:  impressions > 0 ? (spend / impressions) * 1000 : 0,
        };
      });

      // ── Platform summary ─────────────────────────────────────────────────────
      const platMap = new Map<string, { spend: number; impressions: number; clicks: number; installs: number }>();
      for (const r of rawPlatform) {
        const key      = PLATFORM_LABEL[r.publisher_platform ?? ''] ?? r.publisher_platform ?? 'Autre';
        const spend    = Number(r.spend      ?? 0);
        const impr     = Number(r.impressions ?? 0);
        const clicks   = Number(r.clicks     ?? 0);
        const installs = action(r.actions, 'mobile_app_install', 'omni_app_install');
        const cur      = platMap.get(key) ?? { spend: 0, impressions: 0, clicks: 0, installs: 0 };
        platMap.set(key, {
          spend:       cur.spend       + spend,
          impressions: cur.impressions + impr,
          clicks:      cur.clicks      + clicks,
          installs:    cur.installs    + installs,
        });
      }
      const platformSummary: PlatformSummary[] = [...platMap.entries()]
        .map(([platform, v]) => ({
          platform,
          spend:       v.spend,
          impressions: v.impressions,
          clicks:      v.clicks,
          installs:    v.installs,
          cpm: v.impressions > 0 ? (v.spend / v.impressions) * 1000 : 0,
          ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
          cpi: v.installs    > 0 ? v.spend  / v.installs    : 0,
        }))
        .sort((a, b) => b.spend - a.spend);

      // ── Age × platform ───────────────────────────────────────────────────────
      const apMap = new Map<string, { spend: number; impressions: number; installs: number }>();
      for (const r of rawAgePlatform) {
        const age      = r.age ?? '';
        const platform = PLATFORM_LABEL[r.publisher_platform ?? ''] ?? r.publisher_platform ?? 'Autre';
        const key      = `${age}||${platform}`;
        const spend    = Number(r.spend      ?? 0);
        const impr     = Number(r.impressions ?? 0);
        const installs = action(r.actions, 'mobile_app_install', 'omni_app_install');
        const cur      = apMap.get(key) ?? { spend: 0, impressions: 0, installs: 0 };
        apMap.set(key, { spend: cur.spend + spend, impressions: cur.impressions + impr, installs: cur.installs + installs });
      }
      const agePlatform: AgePlatformRow[] = [...apMap.entries()].map(([key, v]) => {
        const [age, platform] = key.split('||');
        return {
          age, platform,
          spend:       v.spend,
          impressions: v.impressions,
          installs:    v.installs,
          cpi: v.installs    > 0 ? v.spend / v.installs    : 0,
          cpm: v.impressions > 0 ? (v.spend / v.impressions) * 1000 : 0,
        };
      }).sort((a, b) => AGE_ORDER.indexOf(a.age) - AGE_ORDER.indexOf(b.age) || a.platform.localeCompare(b.platform));

      const campaigns = [...new Set(rows.map((r) => r.campaignName))].sort();
      const products  = [...new Set(rows.map((r) => r.product))].sort();
      const ageGroups = AGE_ORDER.filter((a) => rows.some((r) => r.age === a));
      const platforms = [...new Set(agePlatform.map((r) => r.platform))].sort();

      return { rows, campaigns, products, ageGroups, platformSummary, agePlatform, platforms };
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Demographics]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
