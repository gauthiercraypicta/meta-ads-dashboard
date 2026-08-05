import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';
import type { DemographicsResponse, DemoRow } from '@/types/demographics';

const BASE    = 'https://graph.facebook.com/v21.0';
const TTL     = 20 * 60 * 1000;
const TOKEN   = process.env.META_ACCESS_TOKEN   ?? '';
const ACCOUNT = process.env.META_AD_ACCOUNT_ID  ?? '';

// Fixed window: campaigns since July 1 2026
const SINCE = '2026-07-01';

const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

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
  campaign_name: string;
  campaign_id:   string;
  age:           string;
  gender:        string;
  spend:         string;
  impressions:   string;
  clicks:        string;
  reach:         string;
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

      const params = new URLSearchParams({
        fields:      'campaign_name,campaign_id,spend,impressions,clicks,reach,actions',
        breakdowns:  'age,gender',
        level:       'campaign',
        time_range:  JSON.stringify({ since: SINCE, until: today }),
        filtering:   JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: '0' }]),
        limit:       '5000',
        access_token: TOKEN,
      });

      const raw = await fetchAllPages(`${BASE}/${ACCOUNT}/insights?${params}`);

      const rows: DemoRow[] = raw.map((r) => {
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
          age:          r.age,
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

      const campaigns = [...new Set(rows.map((r) => r.campaignName))].sort();
      const products  = [...new Set(rows.map((r) => r.product))].sort();
      const ageGroups = AGE_ORDER.filter((a) => rows.some((r) => r.age === a));

      return { rows, campaigns, products, ageGroups };
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Demographics]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
