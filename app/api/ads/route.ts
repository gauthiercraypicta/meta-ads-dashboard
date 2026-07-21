import { NextResponse } from 'next/server';

const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN!;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;

interface AdRecord {
  id: string;
  [key: string]: unknown;
}

/** Paginated fetch — follows paging.next up to maxPages */
async function fetchAllPages(initialUrl: string, maxPages = 5): Promise<AdRecord[]> {
  const results: AdRecord[] = [];
  let next: string | undefined = initialUrl;
  let page = 0;

  while (next && page < maxPages) {
    const res: Response = await fetch(next, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`Meta API: ${data.error.message}`);
    if (data.data) results.push(...data.data);
    next = data.paging?.next;
    page++;
  }

  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') || 'last_30d';

  try {
    const creativeFields = [
      'id', 'name', 'object_type',
      'thumbnail_url', 'image_url',
      'body', 'title', 'call_to_action_type', 'video_id',
    ].join(',');

    const insightFields = [
      'spend', 'impressions', 'reach', 'clicks',
      'ctr', 'cpc', 'cpm', 'frequency',
      'actions', 'action_values', 'purchase_roas',
      'video_play_actions',
      'video_thruplay_watched_actions',
    ].join(',');

    const params = new URLSearchParams({
      fields: [
        'name',
        'status',
        'created_time',
        'adset_id',
        'adset{id,name}',
        `creative{${creativeFields}}`,
        datePreset === 'since_dec_1'
          ? `insights.time_range({"since":"2025-12-01","until":"${new Date().toISOString().split('T')[0]}"}){${insightFields}}`
          : `insights.date_preset(${datePreset}){${insightFields}}`,
      ].join(','),
      limit: '100',
      access_token: META_ACCESS_TOKEN,
    });

    const url = `https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/ads?${params}`;
    const allAds = await fetchAllPages(url);

    // Only return ads that had activity (insights data) during the selected period
    const activeAds = allAds.filter((ad) => {
      const insights = ad.insights as { data?: unknown[] } | undefined;
      return insights?.data && insights.data.length > 0;
    });

    return NextResponse.json({ data: activeAds });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
