import { NextResponse } from 'next/server';
import { withCache } from '@/lib/apiCache';

const BASE    = 'https://graph.facebook.com/v21.0';
const TTL     = 60 * 60 * 1000; // 1h — budget changes are rare
const TOKEN   = process.env.META_ACCESS_TOKEN  ?? '';
const ACCOUNT = process.env.META_AD_ACCOUNT_ID ?? '';

export interface BudgetChange {
  date:       string;   // YYYY-MM-DD
  campaignId: string;
  campaignName: string;
  oldBudget:  number;   // USD/day
  newBudget:  number;   // USD/day
}

interface ActivityRow {
  event_type:  string;
  event_time:  string;
  object_id:   string;
  object_name: string;
  extra_data?: string;
}

interface ActivityResponse {
  data?:   ActivityRow[];
  paging?: { next?: string };
  error?:  { message: string };
}

export async function GET(req: Request) {
  if (!TOKEN || !ACCOUNT) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID manquants' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';

  const today = new Date();
  const days: Record<string, number> = { yesterday: 1, last_3d: 3, last_7d: 7, last_30d: 30, last_90d: 90 };
  const daysBack = datePreset === 'since_dec_1' ? 270 : (days[datePreset] ?? 30);
  const since = Math.floor((today.getTime() - daysBack * 86_400_000) / 1000);

  const cacheKey = `meta-budget-changes:${datePreset}`;

  try {
    const result = await withCache<{ changes: BudgetChange[] }>(cacheKey, TTL, async () => {
      const params = new URLSearchParams({
        fields:       'event_type,event_time,object_id,object_name,extra_data',
        since:        String(since),
        limit:        '500',
        access_token: TOKEN,
      });

      const res  = await fetch(`${BASE}/${ACCOUNT}/activities?${params}`);
      const json = await res.json() as ActivityResponse;
      if (json.error) throw new Error(json.error.message);

      const rows = json.data ?? [];

      const changes: BudgetChange[] = [];
      for (const r of rows) {
        if (r.event_type !== 'update_ad_set_budget' && r.event_type !== 'update_campaign_budget') continue;
        if (!r.extra_data) continue;

        let extra: { old_value?: { old_value?: number }; new_value?: { new_value?: number } };
        try { extra = JSON.parse(r.extra_data); } catch { continue; }

        const oldCents = extra.old_value?.old_value ?? 0;
        const newCents = extra.new_value?.new_value ?? 0;

        // Only increases
        if (newCents <= oldCents) continue;

        const date = r.event_time.split('T')[0];

        changes.push({
          date,
          campaignId:   r.object_id,
          campaignName: r.object_name,
          oldBudget:    Math.round(oldCents / 100),  // cents → dollars
          newBudget:    Math.round(newCents / 100),
        });
      }

      // Deduplicate same campaign same day (keep largest increase)
      const deduped = new Map<string, BudgetChange>();
      for (const c of changes) {
        const key = `${c.date}:${c.campaignId}`;
        const existing = deduped.get(key);
        if (!existing || c.newBudget > existing.newBudget) deduped.set(key, c);
      }

      return { changes: [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meta-budget-changes]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
