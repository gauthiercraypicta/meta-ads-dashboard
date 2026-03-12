import { NextResponse } from 'next/server';

const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const adId = searchParams.get('ad_id');
  const datePreset = searchParams.get('date_preset') || 'last_30d';

  if (!adId) {
    return NextResponse.json({ error: 'ad_id required' }, { status: 400 });
  }

  try {
    const insightFields = [
      'spend', 'impressions', 'reach', 'clicks',
      'ctr', 'cpc', 'cpm', 'frequency',
      'actions', 'action_values', 'purchase_roas',
    ].join(',');

    const params = new URLSearchParams({
      fields: insightFields,
      date_preset: datePreset,
      time_increment: '1',
      access_token: META_ACCESS_TOKEN,
    });

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${adId}/insights?${params}`,
      { next: { revalidate: 0 } },
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
