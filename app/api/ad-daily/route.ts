import { NextResponse } from 'next/server';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!;

/** Convert date_preset to explicit time_range including today */
function toTimeRange(datePreset: string): { since: string; until: string } {
  const today = new Date();
  const until = today.toISOString().split('T')[0];

  if (datePreset === 'since_dec_1') {
    return { since: '2025-12-01', until };
  }

  let days: number;
  switch (datePreset) {
    case 'last_7d':  days = 7;  break;
    case 'last_90d': days = 90; break;
    case 'last_30d':
    default:         days = 30; break;
  }

  const since = new Date(today);
  since.setDate(today.getDate() - days);

  return { since: since.toISOString().split('T')[0], until };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const adId = searchParams.get('ad_id');
  const datePreset = searchParams.get('date_preset') || 'last_30d';

  if (!adId) {
    return NextResponse.json({ error: 'ad_id required' }, { status: 400 });
  }

  const timeRange = toTimeRange(datePreset);

  try {
    const insightFields = [
      'spend', 'impressions', 'reach', 'clicks',
      'ctr', 'cpc', 'cpm', 'frequency',
      'actions', 'action_values', 'purchase_roas',
      'video_play_actions',
      'video_thruplay_watched_actions',
    ].join(',');

    const params = new URLSearchParams({
      fields: insightFields,
      time_range: JSON.stringify(timeRange),
      time_increment: '1',
      access_token: META_ACCESS_TOKEN,
    });

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${adId}/insights?${params}`,
      { next: { revalidate: 120 } },
    );
    const data = await res.json();

    if (data.error) {
      return NextResponse.json(
        { error: `Meta API: ${data.error.message}` },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: data.data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
