import { NextResponse } from 'next/server';

const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN!;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') || 'last_30d';

  try {
    const creativeFields = [
      'id', 'name', 'video_id', 'thumbnail_url', 'object_type', 'title', 'body',
    ].join(',');

    const insightFields = [
      'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpm',
      'actions',
      'video_thruplay_watched_actions',
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p95_watched_actions',
      'video_p100_watched_actions',
    ].join(',');

    const params = new URLSearchParams({
      fields: [
        'name',
        `creative{${creativeFields}}`,
        datePreset === 'since_dec_1'
          ? `insights.time_range({"since":"2025-12-01","until":"${new Date().toISOString().split('T')[0]}"}){${insightFields}}`
          : `insights.date_preset(${datePreset}){${insightFields}}`,
      ].join(','),
      filtering: JSON.stringify([
        { field: 'creative.object_type', operator: 'IN', value: ['VIDEO'] },
      ]),
      limit: '200',
      access_token: META_ACCESS_TOKEN,
    });

    const res  = await fetch(
      `https://graph.facebook.com/v18.0/${META_AD_ACCOUNT_ID}/ads?${params}`,
      { next: { revalidate: 0 } },
    );
    const data = await res.json();

    if (data.error) {
      return NextResponse.json(
        { error: `Meta API: ${data.error.message}` },
        { status: 400 },
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
