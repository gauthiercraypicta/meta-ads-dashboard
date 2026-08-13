import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';

const BASE    = 'https://graph.facebook.com/v21.0';
const TTL     = 20 * 60 * 1000;
const TOKEN   = process.env.META_ACCESS_TOKEN  ?? '';
const ACCOUNT = process.env.META_AD_ACCOUNT_ID ?? '';

export interface MetaDailyRow {
  date:         string;
  campaignId:   string;
  campaignName: string;
  installs:     number;
  engagement:   number; // fb_mobile_activate_app
}

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

interface RawRow {
  date_start:    string;
  campaign_id:   string;
  campaign_name: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface RawResponse {
  data?:   RawRow[];
  paging?: { next?: string };
  error?:  { message: string };
}

async function fetchAllPages(url: string): Promise<RawRow[]> {
  let rows: RawRow[] = [];
  let next: string | undefined = url;
  let page = 0;
  while (next && page < 10) {
    const res = await fetch(next);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Meta API ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json() as RawResponse;
    if (json.error) throw new Error(json.error.message);
    rows = [...rows, ...(json.data ?? [])];
    next = json.paging?.next;
    page++;
  }
  return rows;
}

export async function GET(req: Request) {
  if (!TOKEN || !ACCOUNT) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID manquants' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';

  const today = new Date();
  const fmt   = (d: Date) => d.toISOString().split('T')[0];
  // Exclude today (incomplete day) — same logic as Adjust route
  const until = fmt(new Date(today.getTime() - 86_400_000));

  let since: string;
  const days: Record<string, number> = { last_7d: 7, last_30d: 30, last_90d: 90 };
  if (datePreset === 'since_dec_1') {
    since = '2025-12-01';
  } else {
    const d = new Date(today);
    d.setDate(today.getDate() - (days[datePreset] ?? 30));
    since = fmt(d);
  }

  const cacheKey = `meta-daily-installs:${datePreset}`;

  try {
    const result = await withCache<{ rows: MetaDailyRow[] }>(cacheKey, TTL, async () => {
      const params = new URLSearchParams({
        fields:         'date_start,campaign_id,campaign_name,actions',
        level:          'campaign',
        time_increment: '1',
        time_range:     JSON.stringify({ since, until }),
        filtering:      JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: '0' }]),
        limit:          '5000',
        access_token:   TOKEN,
      });

      const raw = await fetchAllPages(`${BASE}/${ACCOUNT}/insights?${params}`);

      const rows: MetaDailyRow[] = raw.map((r) => ({
        date:         r.date_start,
        campaignId:   r.campaign_id,
        campaignName: r.campaign_name,
        installs:     action(r.actions, 'mobile_app_install', 'omni_app_install'),
        // fb_mobile_activate_app = app opens after install (Meta's "engagement" attribution)
        engagement:   action(r.actions, 'fb_mobile_activate_app'),
      }));

      return { rows };
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meta-daily-installs]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
