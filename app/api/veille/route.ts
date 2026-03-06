import { NextResponse } from 'next/server';
import type {
  VeilleData,
  BrandSummary,
  AdLibraryAd,
  CopyAngle,
  AdTone,
  BrandConfig,
} from '@/types/veille';

// ─── Brands config ─────────────────────────────────────────────────────────────
const BRANDS: BrandConfig[] = [
  { id: 'picta',      name: 'Picta',      pageId: '225602514013',   color: '#3B82F6' },
  { id: 'shutterfly', name: 'Shutterfly', pageId: '9131624063',     color: '#F97316' },
  { id: 'snapfish',   name: 'Snapfish',   pageId: '25508935150',    color: '#22C55E' },
  { id: 'chatbooks',  name: 'Chatbooks',  pageId: '434468146684211', color: '#A855F7' },
  { id: 'mpix',       name: 'Mpix',       pageId: '49861873185',    color: '#F43F5E' },
];

// ─── Copy analysis (regex-based, no Claude API needed) ─────────────────────────
function analyzeAdCopy(body: string, title?: string): {
  angle: CopyAngle;
  hasDiscount: boolean;
  discountPct: number | null;
  tone: AdTone;
  keywords: string[];
} {
  const text = `${body} ${title ?? ''}`.toLowerCase();

  const discountMatch = text.match(/(\d+)%\s*off/);
  const hasDiscount = Boolean(
    discountMatch ||
    /\b(save|sale|deal|promo|coupon|code|free shipping|half off|discount|sitewide)\b/.test(text),
  );
  const discountPct = discountMatch ? parseInt(discountMatch[1], 10) : null;

  // Priority order for angle detection
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

  let tone: AdTone;
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

// ─── Build brand summary from ads ─────────────────────────────────────────────
function summarizeBrand(brand: BrandConfig, ads: AdLibraryAd[]): BrandSummary {
  const activeAds = ads.filter((a) => a.isActive);

  const avgAgeDays =
    activeAds.length > 0
      ? activeAds.reduce((s, a) => s + a.ageDays, 0) / activeAds.length
      : 0;

  const longestRunningDays =
    activeAds.length > 0 ? Math.max(...activeAds.map((a) => a.ageDays)) : 0;

  const ctas: Record<string, number> = {};
  for (const ad of activeAds) {
    ctas[ad.cta] = (ctas[ad.cta] ?? 0) + 1;
  }

  const angles: Record<CopyAngle, number> = {
    promotion: 0, lifestyle: 0, product: 0,
    social_proof: 0, urgency: 0, occasion: 0, other: 0,
  };
  for (const ad of ads) {
    angles[ad.angle] = (angles[ad.angle] ?? 0) + 1;
  }

  const activeAngles: Record<CopyAngle, number> = {
    promotion: 0, lifestyle: 0, product: 0,
    social_proof: 0, urgency: 0, occasion: 0, other: 0,
  };
  for (const ad of activeAds) {
    activeAngles[ad.angle] = (activeAngles[ad.angle] ?? 0) + 1;
  }
  const topAngle = (
    Object.entries(activeAngles).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'other'
  ) as CopyAngle;

  const promotionPct = ads.length > 0 ? (angles.promotion / ads.length) * 100 : 0;
  const emotionalPct = ads.length > 0 ? ((angles.lifestyle + angles.occasion) / ads.length) * 100 : 0;

  const totalSpendLow  = activeAds.reduce((s, a) => s + a.spendLow, 0);
  const totalSpendHigh = activeAds.reduce((s, a) => s + a.spendHigh, 0);

  return {
    brand,
    totalAds: ads.length,
    activeAds: activeAds.length,
    avgAgeDays: Math.round(avgAgeDays),
    longestRunningDays,
    ctas,
    angles,
    topAngle,
    promotionPct: Math.round(promotionPct),
    emotionalPct: Math.round(emotionalPct),
    totalSpendLow,
    totalSpendHigh,
    ads,
  };
}

// ─── Mock ad builder ───────────────────────────────────────────────────────────
interface MockAdInput {
  id: string;
  pageId: string;
  pageName: string;
  body: string;
  title?: string;
  cta?: string;
  isActive?: boolean;
  platforms?: string[];
  deliveryStart: string;
  impressionsLow?: number;
  impressionsHigh?: number;
  spendLow?: number;
  spendHigh?: number;
  snapshotUrl?: string;
}

function makeAd(p: MockAdInput): AdLibraryAd {
  const ageDays = Math.floor(
    (Date.now() - new Date(p.deliveryStart).getTime()) / (1000 * 60 * 60 * 24),
  );
  const analysis = analyzeAdCopy(p.body, p.title);
  return {
    id:              p.id,
    pageId:          p.pageId,
    pageName:        p.pageName,
    body:            p.body,
    title:           p.title,
    cta:             p.cta ?? 'SHOP_NOW',
    snapshotUrl:     p.snapshotUrl,
    deliveryStart:   p.deliveryStart,
    ageDays,
    isActive:        p.isActive ?? true,
    platforms:       p.platforms ?? ['facebook', 'instagram'],
    impressionsLow:  p.impressionsLow  ?? 50000,
    impressionsHigh: p.impressionsHigh ?? 200000,
    spendLow:        p.spendLow  ?? 100,
    spendHigh:       p.spendHigh ?? 499,
    ...analysis,
  };
}

// ─── Rich mock data (mirrors real FB Ad Library structure) ─────────────────────
// Dates relative to 2026-03-03 (today per context)
function generateMockAds(): AdLibraryAd[] {
  const d = (n: number) => {
    const dt = new Date('2026-03-03');
    dt.setDate(dt.getDate() - n);
    return dt.toISOString().split('T')[0];
  };

  return [
    // ── SHUTTERFLY (aggressive promoter, most active) ──────────────────────────
    makeAd({ id: 'sf_001', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(48), cta: 'SHOP_NOW', impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999, body: 'Get 50% off all photo prints — today only! Use code SAVE50 at checkout. Quality guaranteed.', title: '50% Off Photo Prints' }),
    makeAd({ id: 'sf_002', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(40), cta: 'ORDER_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 300, spendHigh: 999, body: 'Turn your memories into a beautiful photo book. Starting at $9.99. Save 40% with code BOOK40.', title: 'Photo Books from $9.99' }),
    makeAd({ id: 'sf_003', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(32), cta: 'SHOP_NOW', impressionsLow: 300000, impressionsHigh: 700000, spendLow: 300, spendHigh: 999, body: "Mother's Day is just around the corner. Shop personalized photo gifts she'll treasure forever. Free shipping on orders over $29.", title: "Mother's Day Gifts" }),
    makeAd({ id: 'sf_004', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(22), cta: 'GET_OFFER', impressionsLow: 100000, impressionsHigh: 500000, spendLow: 300, spendHigh: 999, body: 'Prints as low as $0.09 each. Canvas, posters, mugs and more — all personalized just for you. Limited time deal.', title: 'Prints From $0.09' }),
    makeAd({ id: 'sf_005', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(18), cta: 'ORDER_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 300, spendHigh: 999, body: 'Loved by over 1 million families. Create your perfect photo book in under 10 minutes. Get 30% off today.', title: '1M+ Happy Customers' }),
    makeAd({ id: 'sf_006', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(14), cta: 'SHOP_NOW', impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999, body: "Flash sale: 60% off photo books this weekend only! Don't miss out — offer ends Sunday.", title: '60% Off This Weekend' }),
    makeAd({ id: 'sf_007', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(10), cta: 'SHOP_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 300, spendHigh: 999, body: 'Create wall art that tells your story. Canvas prints, metal prints, and more — 45% off sitewide.', title: 'Wall Art 45% Off' }),
    makeAd({ id: 'sf_008', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(7),  cta: 'GET_OFFER', impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999, body: 'Spring sale is here! Save up to 50% on all photo products. Free shipping on orders $29+.', title: 'Spring Sale: Up to 50% Off' }),
    makeAd({ id: 'sf_009', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(5),  cta: 'ORDER_NOW', impressionsLow: 100000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: 'Print your Instagram photos in seconds. Beautiful, affordable prints starting at $0.15. Order now.', title: 'Print Your Instagrams' }),
    makeAd({ id: 'sf_010', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(3),  cta: 'SHOP_NOW', impressionsLow: 100000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, isActive: false, body: "Your graduation deserves to be remembered. Custom photo gifts for grads — save 35% with code GRAD35.", title: 'Celebrate Your Grad' }),
    makeAd({ id: 'sf_011', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(65), cta: 'ORDER_NOW', impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999, isActive: false, body: 'Holiday cards made easy. Upload your photos, choose a design, done! Order by Dec 15 for Christmas delivery.', title: 'Holiday Photo Cards' }),
    makeAd({ id: 'sf_012', pageId: '9131624063', pageName: 'Shutterfly', deliveryStart: d(58), cta: 'SHOP_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, isActive: false, body: "Give the gift of memories this Valentine's Day. Personalized photo jewelry, mugs, and more. Free shipping.", title: "Valentine's Day Gifts" }),

    // ── SNAPFISH (value-focused, mid-market) ───────────────────────────────────
    makeAd({ id: 'snap_001', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(45), cta: 'ORDER_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: 'Print your photos for as low as $0.09 each. Our lowest price ever — quality guaranteed.', title: 'Photos from $0.09' }),
    makeAd({ id: 'snap_002', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(37), cta: 'SHOP_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: 'Create stunning photo gifts for any occasion. Get 50% off sitewide — use code SNAP50 at checkout.', title: '50% Off Everything' }),
    makeAd({ id: 'snap_003', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(28), cta: 'ORDER_NOW', impressionsLow: 50000, impressionsHigh: 200000, spendLow: 100, spendHigh: 499, body: 'Memories deserve to be printed. Easy to order, fast delivery, beautiful quality. Photo books from $9.99.', title: 'Photo Books from $9.99' }),
    makeAd({ id: 'snap_004', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(20), cta: 'GET_OFFER', impressionsLow: 100000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: 'Custom canvas prints that transform your walls. 60×40cm for just $19.99 — limited time offer.', title: 'Canvas Prints $19.99' }),
    makeAd({ id: 'snap_005', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(12), cta: 'SHOP_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: 'Spring into savings: 40% off all prints and photo books. Free delivery on orders over $25. Shop now.', title: '40% Off Spring Sale' }),
    makeAd({ id: 'snap_006', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(8),  cta: 'ORDER_NOW', impressionsLow: 50000, impressionsHigh: 200000, spendLow: 100, spendHigh: 499, body: 'Turn your phone photos into beautiful prints. Wallet, 4×6, 5×7 — fast shipping, affordable prices.', title: 'Phone Photos to Prints' }),
    makeAd({ id: 'snap_007', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(4),  cta: 'GET_OFFER', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: "The perfect Mother's Day gift: a custom photo mug, calendar, or book. Save 45% with code MOM45.", title: "Mother's Day Photo Gifts" }),
    makeAd({ id: 'snap_008', pageId: '25508935150', pageName: 'Snapfish', deliveryStart: d(70), cta: 'ORDER_NOW', impressionsLow: 100000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, isActive: false, body: 'New Year, new memories. Create a custom 2026 photo calendar. From $12.99 — 30% off for limited time.', title: '2026 Photo Calendars' }),

    // ── CHATBOOKS (subscription, lifestyle-focused) ────────────────────────────
    makeAd({ id: 'cb_001', pageId: '434468146684211', pageName: 'Chatbooks', deliveryStart: d(58), cta: 'SUBSCRIBE_NOW', impressionsLow: 200000, impressionsHigh: 500000, spendLow: 300, spendHigh: 999, body: 'Your life, in print, automatically. Chatbooks delivers a new photo book to your door every month — starting at $8.', title: 'Auto Photo Books · From $8/mo' }),
    makeAd({ id: 'cb_002', pageId: '434468146684211', pageName: 'Chatbooks', deliveryStart: d(50), cta: 'GET_OFFER',      impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999, body: "Stop letting your family's moments live only on your phone. Chatbooks turns them into beautiful printed books. Try your first book free.", title: 'First Book Free' }),
    makeAd({ id: 'cb_003', pageId: '434468146684211', pageName: 'Chatbooks', deliveryStart: d(42), cta: 'SUBSCRIBE_NOW', impressionsLow: 100000, impressionsHigh: 500000, spendLow: 300, spendHigh: 999, body: 'The easiest way to print photos. Connect your camera roll, we do the rest. Subscribers save up to 60%.', title: 'Easiest Photo Printing' }),
    makeAd({ id: 'cb_004', pageId: '434468146684211', pageName: 'Chatbooks', deliveryStart: d(28), cta: 'LEARN_MORE',     impressionsLow: 200000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: 'A photo book every month. Your kids will love flipping through their childhood memories. Starting at $8.', title: 'Monthly Photo Books · $8' }),
    makeAd({ id: 'cb_005', pageId: '434468146684211', pageName: 'Chatbooks', deliveryStart: d(16), cta: 'SHOP_NOW',       impressionsLow: 100000, impressionsHigh: 500000, spendLow: 100, spendHigh: 499, body: 'Gift a subscription. Give the people you love a lasting physical memory every month. Perfect for parents and grandparents.', title: 'Gift a Subscription' }),
    makeAd({ id: 'cb_006', pageId: '434468146684211', pageName: 'Chatbooks', deliveryStart: d(6),  cta: 'GET_OFFER',      impressionsLow: 500000, impressionsHigh: 1000000, spendLow: 300, spendHigh: 999, body: "Mother's Day is coming. Give mom a photo book subscription she'll cherish all year. First month just $1.", title: "Mother's Day · First Month $1" }),

    // ── MPIX (professional, premium quality) ──────────────────────────────────
    makeAd({ id: 'mp_001', pageId: '49861873185', pageName: 'Mpix', deliveryStart: d(75), cta: 'ORDER_NOW', impressionsLow: 50000, impressionsHigh: 200000, spendLow: 100, spendHigh: 499, body: 'Museum-quality prints for your most precious memories. Archival inks, premium papers, unmatched color accuracy.', title: 'Museum-Quality Photo Prints' }),
    makeAd({ id: 'mp_002', pageId: '49861873185', pageName: 'Mpix', deliveryStart: d(60), cta: 'ORDER_NOW', impressionsLow: 50000, impressionsHigh: 200000, spendLow: 100, spendHigh: 499, body: 'Award-winning photo lab trusted by professional photographers worldwide. Try your first order — free shipping.', title: 'Pro-Level Prints' }),
    makeAd({ id: 'mp_003', pageId: '49861873185', pageName: 'Mpix', deliveryStart: d(33), cta: 'LEARN_MORE', impressionsLow: 50000, impressionsHigh: 200000, spendLow: 100, spendHigh: 499, body: 'Your photos deserve the very best. Mpix fine art prints — vivid colors, lasting quality, no compromises.', title: 'Fine Art Prints' }),
    makeAd({ id: 'mp_004', pageId: '49861873185', pageName: 'Mpix', deliveryStart: d(22), cta: 'ORDER_NOW', impressionsLow: 10000, impressionsHigh: 50000, spendLow: 100, spendHigh: 499, body: 'Professional-grade prints. Rated #1 by photographers for color accuracy. Ships within 2 business days.', title: 'Rated #1 By Photographers' }),
    makeAd({ id: 'mp_005', pageId: '49861873185', pageName: 'Mpix', deliveryStart: d(14), cta: 'ORDER_NOW', impressionsLow: 50000, impressionsHigh: 200000, spendLow: 100, spendHigh: 499, body: 'Canvas gallery wraps from $24.99. Handcrafted by our experts, delivered to your door. Free shipping over $35.', title: 'Canvas Gallery Wraps' }),

    // ── PICTA (our brand — small footprint = opportunity) ────────────────────
    makeAd({ id: 'picta_001', pageId: '225602514013', pageName: 'Picta', deliveryStart: d(28), cta: 'ORDER_NOW', impressionsLow: 10000, impressionsHigh: 50000, spendLow: 100, spendHigh: 299, body: 'Print your favorite photos in just a few clicks. Perfect quality, fast delivery. Starting from $0.15 per print.', title: 'Photo Prints from $0.15' }),
    makeAd({ id: 'picta_002', pageId: '225602514013', pageName: 'Picta', deliveryStart: d(14), cta: 'SHOP_NOW', impressionsLow: 10000, impressionsHigh: 50000, spendLow: 100, spendHigh: 299, body: "The gift they'll actually love. Create a custom photo book in minutes. Beautiful quality, fast delivery.", title: 'Custom Photo Books' }),
    makeAd({ id: 'picta_003', pageId: '225602514013', pageName: 'Picta', deliveryStart: d(5),  cta: 'ORDER_NOW', impressionsLow: 10000, impressionsHigh: 50000, spendLow: 100, spendHigh: 299, body: 'Your photos deserve to be seen. High-quality prints delivered right to your door. Easy ordering, guaranteed satisfaction.', title: 'Quality Photo Prints' }),
  ];
}

// ─── Live FB Ad Library fetch ──────────────────────────────────────────────────
async function fetchFBAdLibrary(brand: BrandConfig): Promise<AdLibraryAd[]> {
  const token = process.env.FB_ACCESS_TOKEN;
  if (!token) return [];

  const params = new URLSearchParams({
    access_token: token,
    search_page_ids: brand.pageId,
    ad_reached_countries: '["US"]',
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
    limit: '50',
  });

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/ads_archive?${params}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.error) return [];

    const ads: AdLibraryAd[] = [];
    for (const raw of json.data ?? []) {
      const body = raw.ad_creative_bodies?.[0] ?? '';
      if (!body) continue;

      const title       = raw.ad_creative_link_titles?.[0];
      const cta         = raw.call_to_action_types?.[0] ?? 'SHOP_NOW';
      const delivStart  = raw.ad_delivery_start_time ?? new Date().toISOString().split('T')[0];
      const delivStop   = raw.ad_delivery_stop_time;
      const ageDays     = Math.floor((Date.now() - new Date(delivStart).getTime()) / 864e5);
      const isActive    = !delivStop || new Date(delivStop) > new Date();
      const impLow      = parseInt(raw.impressions?.lower_bound  ?? '0', 10);
      const impHigh     = parseInt(raw.impressions?.upper_bound  ?? '0', 10);
      const spendLow    = parseInt(raw.spend?.lower_bound        ?? '0', 10);
      const spendHigh   = parseInt(raw.spend?.upper_bound        ?? '0', 10);

      ads.push({
        id:             raw.id,
        pageId:         brand.pageId,
        pageName:       brand.name,
        body,
        title,
        cta,
        snapshotUrl:    raw.ad_snapshot_url,
        deliveryStart:  delivStart,
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
  } catch {
    return [];
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function GET() {
  // Try live FB API
  const liveResults = await Promise.allSettled(
    BRANDS.map((b) => fetchFBAdLibrary(b)),
  );
  const hasLive = liveResults.some(
    (r) => r.status === 'fulfilled' && r.value.length > 0,
  );

  let source: 'live' | 'mock';
  let brandAdsMap: Map<string, AdLibraryAd[]>;

  if (hasLive) {
    source = 'live';
    brandAdsMap = new Map();
    BRANDS.forEach((b, i) => {
      const r = liveResults[i];
      brandAdsMap.set(b.pageId, r.status === 'fulfilled' ? r.value : []);
    });
  } else {
    source = 'mock';
    const mockAds = generateMockAds();
    brandAdsMap = new Map();
    for (const b of BRANDS) {
      brandAdsMap.set(b.pageId, mockAds.filter((a) => a.pageId === b.pageId));
    }
  }

  const brands = BRANDS.map((b) =>
    summarizeBrand(b, brandAdsMap.get(b.pageId) ?? []),
  );

  const data: VeilleData = {
    brands,
    fetchedAt: new Date().toISOString(),
    source,
  };

  return NextResponse.json(data);
}
