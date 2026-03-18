import { NextRequest, NextResponse } from 'next/server';
import type { CompetitorAd, CopyAngle } from '@/types';

function analyzeAdCopy(body: string, title?: string): Pick<CompetitorAd, 'angle' | 'hasDiscount' | 'discountPct' | 'tone' | 'keywords'> {
  const text = `${body} ${title ?? ''}`.toLowerCase();
  const discountMatch = text.match(/(\d+)%\s*off/);
  const hasDiscount = Boolean(discountMatch || /\b(save|sale|deal|promo|coupon|free shipping|discount)\b/.test(text));
  const discountPct = discountMatch ? parseInt(discountMatch[1], 10) : null;

  let angle: CopyAngle;
  if (/\b(mother['']?s day|father['']?s day|christmas|holiday|birthday|graduation|valentine)\b/.test(text)) angle = 'occasion';
  else if (/\b(limited time|today only|expires|hurry|last chance|ends soon)\b/.test(text)) angle = 'urgency';
  else if (hasDiscount || /\b(off|sale|deal|price|affordable|starting at)\b/.test(text)) angle = 'promotion';
  else if (/\b(memory|memories|family|love|cherish|precious|together|moment)\b/.test(text)) angle = 'lifestyle';
  else if (/\b(quality|museum|award|professional|archival|premium|guaranteed)\b/.test(text)) angle = 'product';
  else if (/\b(million|customers|rated|trusted|loved|reviews|best seller)\b/.test(text)) angle = 'social_proof';
  else angle = 'other';

  let tone: CompetitorAd['tone'];
  if (/\b(museum|archival|professional|luxury|fine art)\b/.test(text)) tone = 'premium';
  else if (/\b(love|cherish|precious|beautiful|dream|treasure)\b/.test(text)) tone = 'emotional';
  else if (/\b(fun|playful|easy|simple|quick|instant)\b/.test(text)) tone = 'playful';
  else tone = 'functional';

  const keywords = ['photo book', 'photo prints', 'wall art', 'canvas print', 'custom', 'personalized', 'free shipping', 'subscription', 'gift', 'calendar']
    .filter((kw) => text.includes(kw));

  return { angle, hasDiscount, discountPct, tone, keywords };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query   = searchParams.get('q') ?? '';
  const country = searchParams.get('country') ?? 'US';
  const token   = process.env.FB_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json({ error: 'FB_ACCESS_TOKEN not configured', ads: [], total: 0 }, { status: 200 });
  }
  if (!query.trim()) {
    return NextResponse.json({ error: 'Missing query', ads: [], total: 0 }, { status: 400 });
  }

  const params = new URLSearchParams({
    access_token: token,
    search_terms: query,
    ad_reached_countries: JSON.stringify([country]),
    ad_type: 'ALL',
    fields: [
      'id', 'page_id', 'page_name',
      'ad_creative_bodies', 'ad_creative_link_titles',
      'call_to_action_types', 'ad_snapshot_url',
      'ad_delivery_start_time', 'ad_delivery_stop_time',
      'impressions', 'spend', 'publisher_platforms',
    ].join(','),
    limit: '30',
  });

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/ads_archive?${params}`);
    const json = await res.json();
    if (json.error) {
      return NextResponse.json({ error: json.error.message, ads: [], total: 0 });
    }

    const ads: CompetitorAd[] = [];
    for (const raw of json.data ?? []) {
      const body = raw.ad_creative_bodies?.[0] ?? '';
      if (!body) continue;
      const title     = raw.ad_creative_link_titles?.[0];
      const start     = raw.ad_delivery_start_time ?? new Date().toISOString().split('T')[0];
      const stop      = raw.ad_delivery_stop_time;
      const ageDays   = Math.floor((Date.now() - new Date(start).getTime()) / 864e5);
      const isActive  = !stop || new Date(stop) > new Date();
      ads.push({
        id:             raw.id,
        pageId:         raw.page_id ?? '',
        pageName:       raw.page_name ?? 'Unknown',
        body, title,
        cta:            raw.call_to_action_types?.[0] ?? 'SHOP_NOW',
        snapshotUrl:    raw.ad_snapshot_url,
        deliveryStart:  start,
        deliveryStop:   stop,
        ageDays, isActive,
        platforms:      raw.publisher_platforms ?? ['facebook'],
        impressionsLow: parseInt(raw.impressions?.lower_bound ?? '0', 10),
        impressionsHigh: parseInt(raw.impressions?.upper_bound ?? '0', 10),
        spendLow:       parseInt(raw.spend?.lower_bound ?? '0', 10),
        spendHigh:      parseInt(raw.spend?.upper_bound ?? '0', 10),
        ...analyzeAdCopy(body, title),
      });
    }

    return NextResponse.json({ ads, total: json.paging?.cursors ? ads.length : ads.length, source: 'live' });
  } catch (e) {
    return NextResponse.json({ error: String(e), ads: [], total: 0 });
  }
}
