import { NextRequest, NextResponse } from 'next/server';
import type {
  CompetitorAd,
  BrandSummary,
  CompetitorData,
  TrackedBrand,
  CopyAngle,
} from '@/types';

// ─── Default tracked brands ────────────────────────────────────────────────
const DEFAULT_BRANDS: TrackedBrand[] = [
  { id: 'shutterfly', name: 'Shutterfly', pageId: '9131624063',      color: '#F97316' },
  { id: 'snapfish',   name: 'Snapfish',   pageId: '25508935150',     color: '#22C55E' },
  { id: 'chatbooks',  name: 'Chatbooks',  pageId: '434468146684211', color: '#A855F7' },
  { id: 'mpix',       name: 'Mpix',       pageId: '49861873185',     color: '#F43F5E' },
  { id: 'mixbook',    name: 'Mixbook',    pageId: '56811218455',     color: '#06B6D4' },
];

// ─── Copy analysis ─────────────────────────────────────────────────────────
function analyzeAdCopy(body: string, title?: string): {
  angle: CopyAngle;
  hasDiscount: boolean;
  discountPct: number | null;
  tone: CompetitorAd['tone'];
  keywords: string[];
} {
  const text = `${body} ${title ?? ''}`.toLowerCase();

  const discountMatch = text.match(/(\d+)%\s*off/);
  const hasDiscount = Boolean(
    discountMatch ||
    /\b(save|sale|deal|promo|coupon|code|free shipping|half off|discount|sitewide)\b/.test(text),
  );
  const discountPct = discountMatch ? parseInt(discountMatch[1], 10) : null;

  let angle: CopyAngle;
  if (/\b(mother['']?s day|father['']?s day|christmas|holiday|birthday|graduation|valentine|anniversary|wedding|new year)\b/.test(text)) {
    angle = 'occasion';
  } else if (/\b(limited time|today only|expires|hurry|last chance|don['']?t miss|ends soon|act now|this weekend)\b/.test(text)) {
    angle = 'urgency';
  } else if (hasDiscount || /\b(off|sale|deal|price|affordable|starting at|as low as|from \$)\b/.test(text)) {
    angle = 'promotion';
  } else if (/\b(memory|memories|family|love|cherish|precious|together|moment|milestone|story|stories|life)\b/.test(text)) {
    angle = 'lifestyle';
  } else if (/\b(quality|museum|award|professional|archival|vivid|color accuracy|fine art|premium|guaranteed)\b/.test(text)) {
    angle = 'product';
  } else if (/\b(million|customers|rated|trusted|loved|reviews|best seller|award.winning|photographers)\b/.test(text)) {
    angle = 'social_proof';
  } else {
    angle = 'other';
  }

  let tone: CompetitorAd['tone'];
  if (/\b(museum|archival|professional|finest|luxury|premium quality|fine art)\b/.test(text)) {
    tone = 'premium';
  } else if (/\b(love|cherish|precious|heart|beautiful|stunning|amazing|dream|treasure)\b/.test(text)) {
    tone = 'emotional';
  } else if (/\b(fun|playful|creative|easy|simple|quick|instant|minutes|surprise)\b/.test(text)) {
    tone = 'playful';
  } else {
    tone = 'functional';
  }

  const keywordSet = [
    'photo book', 'photo books', 'photo prints', 'wall art', 'canvas print', 'canvas prints',
    'custom', 'personalized', 'same day', 'free shipping', 'subscription', 'gift',
    'photo gifts', 'prints', 'album', 'calendar', 'mug',
  ];
  const keywords = keywordSet.filter((kw) => text.includes(kw));

  return { angle, hasDiscount, discountPct, tone, keywords };
}

// ─── Meta Ad Library fetcher ───────────────────────────────────────────────
async function fetchAdsForPage(
  brand: TrackedBrand,
  token: string,
  country: string,
  limit: number,
): Promise<CompetitorAd[]> {
  const params = new URLSearchParams({
    access_token: token,
    search_page_ids: brand.pageId,
    ad_reached_countries: JSON.stringify([country]),
    ad_type: 'ALL',
    fields: [
      'id',
      'page_id',
      'page_name',
      'ad_creative_bodies',
      'ad_creative_link_titles',
      'call_to_action_types',
      'ad_snapshot_url',
      'ad_delivery_start_time',
      'ad_delivery_stop_time',
      'impressions',
      'spend',
      'publisher_platforms',
    ].join(','),
    limit: String(limit),
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/ads_archive?${params}`,
    { next: { revalidate: 1800 } },
  );
  if (!res.ok) return [];
  const json = await res.json();
  if (json.error) {
    console.error('FB Ad Library error:', json.error);
    return [];
  }

  const ads: CompetitorAd[] = [];
  for (const raw of json.data ?? []) {
    const body = raw.ad_creative_bodies?.[0] ?? '';
    if (!body) continue;
    const title      = raw.ad_creative_link_titles?.[0];
    const cta        = raw.call_to_action_types?.[0] ?? 'SHOP_NOW';
    const start      = raw.ad_delivery_start_time ?? new Date().toISOString().split('T')[0];
    const stop       = raw.ad_delivery_stop_time;
    const ageDays    = Math.floor((Date.now() - new Date(start).getTime()) / 864e5);
    const isActive   = !stop || new Date(stop) > new Date();
    const impLow     = parseInt(raw.impressions?.lower_bound ?? '0', 10);
    const impHigh    = parseInt(raw.impressions?.upper_bound ?? '0', 10);
    const spendLow   = parseInt(raw.spend?.lower_bound       ?? '0', 10);
    const spendHigh  = parseInt(raw.spend?.upper_bound       ?? '0', 10);

    ads.push({
      id:             raw.id,
      pageId:         brand.pageId,
      pageName:       brand.name,
      body,
      title,
      cta,
      snapshotUrl:    raw.ad_snapshot_url,
      deliveryStart:  start,
      deliveryStop:   stop,
      ageDays,
      isActive,
      platforms:      raw.publisher_platforms ?? ['facebook'],
      impressionsLow: impLow,
      impressionsHigh: impHigh,
      spendLow,
      spendHigh,
      ...analyzeAdCopy(body, title),
    });
  }
  return ads;
}

// ─── Mock data fallback ────────────────────────────────────────────────────
function generateMockAds(): CompetitorAd[] {
  const d = (n: number) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - n);
    return dt.toISOString().split('T')[0];
  };

  const mk = (
    id: string, pageId: string, pageName: string, body: string,
    opts: Partial<CompetitorAd> = {},
  ): CompetitorAd => {
    const start   = opts.deliveryStart ?? d(Math.floor(Math.random() * 60) + 3);
    const ageDays = Math.floor((Date.now() - new Date(start).getTime()) / 864e5);
    return {
      id, pageId, pageName, body,
      title:          opts.title,
      cta:            opts.cta ?? 'SHOP_NOW',
      snapshotUrl:    opts.snapshotUrl,
      deliveryStart:  start,
      ageDays,
      isActive:       opts.isActive ?? true,
      platforms:      opts.platforms ?? ['facebook', 'instagram'],
      impressionsLow: opts.impressionsLow  ?? 50000,
      impressionsHigh: opts.impressionsHigh ?? 500000,
      spendLow:       opts.spendLow  ?? 100,
      spendHigh:      opts.spendHigh ?? 499,
      ...analyzeAdCopy(body, opts.title),
    };
  };

  return [
    mk('sf_001', '9131624063', 'Shutterfly', 'Get 50% off all photo prints — today only! Use code SAVE50.', { title: '50% Off Photo Prints', deliveryStart: d(48), impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999 }),
    mk('sf_002', '9131624063', 'Shutterfly', 'Turn your memories into a beautiful photo book. Starting at $9.99. Save 40% with code BOOK40.', { title: 'Photo Books from $9.99', deliveryStart: d(40), spendLow: 300, spendHigh: 999 }),
    mk('sf_003', '9131624063', 'Shutterfly', "Mother's Day is just around the corner. Shop personalized photo gifts she'll treasure forever. Free shipping on orders over $29.", { title: "Mother's Day Gifts", deliveryStart: d(32), spendLow: 300, spendHigh: 999 }),
    mk('sf_004', '9131624063', 'Shutterfly', 'Flash sale: 60% off photo books this weekend only! Don\'t miss out — offer ends Sunday.', { title: '60% Off This Weekend', deliveryStart: d(14), impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999 }),
    mk('sf_005', '9131624063', 'Shutterfly', 'Spring sale is here! Save up to 50% on all photo products. Free shipping on orders $29+.', { title: 'Spring Sale: Up to 50% Off', deliveryStart: d(7), impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999 }),
    mk('sf_006', '9131624063', 'Shutterfly', 'Create wall art that tells your story. Canvas prints, metal prints, and more — 45% off sitewide.', { title: 'Wall Art 45% Off', cta: 'ORDER_NOW', deliveryStart: d(10), spendLow: 300, spendHigh: 999 }),

    mk('snap_001', '25508935150', 'Snapfish', 'Print your photos for as low as $0.09 each. Our lowest price ever — quality guaranteed.', { title: 'Photos from $0.09', cta: 'ORDER_NOW', deliveryStart: d(45), impressionsLow: 200000, impressionsHigh: 500000 }),
    mk('snap_002', '25508935150', 'Snapfish', 'Create stunning photo gifts for any occasion. Get 50% off sitewide — use code SNAP50.', { title: '50% Off Everything', deliveryStart: d(37) }),
    mk('snap_003', '25508935150', 'Snapfish', "The perfect Mother's Day gift: a custom photo mug, calendar, or book. Save 45% with code MOM45.", { title: "Mother's Day Photo Gifts", cta: 'GET_OFFER', deliveryStart: d(4) }),
    mk('snap_004', '25508935150', 'Snapfish', 'Spring into savings: 40% off all prints and photo books. Free delivery on orders over $25.', { title: '40% Off Spring Sale', deliveryStart: d(12), impressionsLow: 200000, impressionsHigh: 500000 }),

    mk('cb_001', '434468146684211', 'Chatbooks', 'Your life, in print, automatically. Chatbooks delivers a new photo book every month — from $8.', { title: 'Auto Photo Books · From $8/mo', cta: 'SUBSCRIBE_NOW', deliveryStart: d(58), spendLow: 300, spendHigh: 999 }),
    mk('cb_002', '434468146684211', 'Chatbooks', "Stop letting your family's moments live only on your phone. Try your first book free.", { title: 'First Book Free', cta: 'GET_OFFER', deliveryStart: d(50), impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999 }),
    mk('cb_003', '434468146684211', 'Chatbooks', "Mother's Day is coming. Give mom a photo book subscription she'll cherish. First month just $1.", { title: "Mother's Day · First Month $1", cta: 'GET_OFFER', deliveryStart: d(6), spendLow: 300, spendHigh: 999 }),

    mk('mp_001', '49861873185', 'Mpix', 'Museum-quality prints for your most precious memories. Archival inks, premium papers, unmatched color accuracy.', { title: 'Museum-Quality Photo Prints', cta: 'ORDER_NOW', deliveryStart: d(75), impressionsLow: 50000, impressionsHigh: 200000 }),
    mk('mp_002', '49861873185', 'Mpix', 'Award-winning photo lab trusted by professional photographers worldwide. Free shipping on your first order.', { title: 'Pro-Level Prints', cta: 'ORDER_NOW', deliveryStart: d(60), impressionsLow: 50000, impressionsHigh: 200000 }),
    mk('mp_003', '49861873185', 'Mpix', 'Your photos deserve the very best. Mpix fine art prints — vivid colors, lasting quality, no compromises.', { title: 'Fine Art Prints', cta: 'LEARN_MORE', deliveryStart: d(33), impressionsLow: 50000, impressionsHigh: 200000 }),

    mk('mb_001', '56811218455', 'Mixbook', 'Design a photo book your way. Thousands of templates, total customization. 40% off today.', { title: 'Custom Photo Books · 40% Off', deliveryStart: d(30), impressionsLow: 100000, impressionsHigh: 500000 }),
    mk('mb_002', '56811218455', 'Mixbook', 'The most customizable photo books online. Award-winning design tools. Free shipping over $49.', { title: 'Award-Winning Design', cta: 'GET_STARTED', deliveryStart: d(20), impressionsLow: 100000, impressionsHigh: 500000 }),
    mk('mb_003', '56811218455', 'Mixbook', "Create beautiful calendars for 2026. Personalize every month with your family's photos. Save 35%.", { title: '2026 Photo Calendars · 35% Off', deliveryStart: d(8), impressionsLow: 200000, impressionsHigh: 500000 }),
  ];
}

// ─── Summarize brand ───────────────────────────────────────────────────────
function summarizeBrand(brand: TrackedBrand, ads: CompetitorAd[]): BrandSummary {
  const active = ads.filter((a) => a.isActive);
  const avgAge = active.length > 0
    ? active.reduce((s, a) => s + a.ageDays, 0) / active.length
    : 0;
  const longest = active.length > 0 ? Math.max(...active.map((a) => a.ageDays)) : 0;

  const ctas: Record<string, number> = {};
  for (const a of active) ctas[a.cta] = (ctas[a.cta] ?? 0) + 1;

  const angles = { promotion: 0, lifestyle: 0, product: 0, social_proof: 0, urgency: 0, occasion: 0, other: 0 } as Record<CopyAngle, number>;
  for (const a of ads) angles[a.angle] = (angles[a.angle] ?? 0) + 1;

  const activeAngles = { ...angles } as Record<CopyAngle, number>;
  Object.keys(activeAngles).forEach((k) => { (activeAngles as Record<string, number>)[k] = 0; });
  for (const a of active) activeAngles[a.angle] = (activeAngles[a.angle] ?? 0) + 1;

  const topAngle = (
    Object.entries(activeAngles).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'other'
  ) as CopyAngle;

  const promotionPct = ads.length > 0 ? (angles.promotion / ads.length) * 100 : 0;
  const emotionalPct = ads.length > 0 ? ((angles.lifestyle + angles.occasion) / ads.length) * 100 : 0;

  return {
    brand,
    totalAds: ads.length,
    activeAds: active.length,
    avgAgeDays: Math.round(avgAge),
    longestRunningDays: longest,
    ctas,
    angles,
    topAngle,
    promotionPct: Math.round(promotionPct),
    emotionalPct: Math.round(emotionalPct),
    totalSpendLow:  active.reduce((s, a) => s + a.spendLow,  0),
    totalSpendHigh: active.reduce((s, a) => s + a.spendHigh, 0),
    ads,
  };
}

// ─── Route handler ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country    = searchParams.get('country') ?? 'US';
  const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);
  const pageIdsParam = searchParams.get('pageIds');

  // Use custom brands if provided, else default list
  let brands = DEFAULT_BRANDS;
  if (pageIdsParam) {
    const ids = pageIdsParam.split(',').filter(Boolean);
    brands = ids.map((pid, i) => ({
      id:     `custom_${i}`,
      name:   `Brand ${i + 1}`,
      pageId: pid.trim(),
      color:  ['#3B82F6', '#F97316', '#22C55E', '#A855F7', '#F43F5E', '#06B6D4'][i % 6],
    }));
  }

  const token = process.env.FB_ACCESS_TOKEN;
  let source: 'live' | 'mock' = 'mock';
  let brandAdsMap = new Map<string, CompetitorAd[]>();

  if (token) {
    const results = await Promise.allSettled(
      brands.map((b) => fetchAdsForPage(b, token, country, limitParam)),
    );
    const hasAny = results.some((r) => r.status === 'fulfilled' && r.value.length > 0);
    if (hasAny) {
      source = 'live';
      brands.forEach((b, i) => {
        const r = results[i];
        brandAdsMap.set(b.pageId, r.status === 'fulfilled' ? r.value : []);
      });
    }
  }

  // Fallback to mock
  if (source === 'mock') {
    const mockAds = generateMockAds();
    for (const b of brands) {
      brandAdsMap.set(b.pageId, mockAds.filter((a) => a.pageId === b.pageId));
    }
  }

  const brandSummaries = brands.map((b) =>
    summarizeBrand(b, brandAdsMap.get(b.pageId) ?? []),
  );

  const data: CompetitorData = {
    brands: brandSummaries,
    fetchedAt: new Date().toISOString(),
    source,
    country,
  };

  return NextResponse.json(data);
}
