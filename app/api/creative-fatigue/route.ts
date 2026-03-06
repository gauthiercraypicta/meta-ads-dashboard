import { NextResponse } from 'next/server';

const API_VERSION = 'v18.0';
const BASE_URL    = `https://graph.facebook.com/${API_VERSION}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionRow {
  action_type: string;
  value: string;
  '7d_click'?: string;
}

interface RawAd {
  id: string;
  name: string;
  creative?: {
    id: string;
    name?: string;
    title?: string;
    body?: string;
    thumbnail_url?: string;
  };
  insights?: {
    data: {
      spend: string;
      impressions: string;
      clicks: string;
      ctr: string;
      frequency: string;
      actions?: ActionRow[];
      action_values?: ActionRow[];
    }[];
  };
}

export interface CreativeFatiguePoint {
  creativeId:   string;
  creativeName: string;
  frequency:    number;   // rounded to nearest 0.5
  ctr:          number;   // ratio (not %)
  cvr:          number;   // ratio
  impressions:  number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActionValue(actions: ActionRow[] | undefined, key: '7d_click' | 'value'): number {
  if (!actions) return 0;
  const types = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
  for (const t of types) {
    const a = actions.find((a) => a.action_type === t);
    if (a) return parseFloat(a[key] ?? '0') || 0;
  }
  return 0;
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
  const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN;

  if (!META_AD_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Identifiants Meta manquants.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get('date_preset') ?? 'last_30d';

  try {
    const creativeFields = 'id,name,title,body,thumbnail_url';
    const insightFields  = 'spend,impressions,clicks,ctr,frequency,actions,action_values';

    const params = new URLSearchParams({
      fields: [
        'id',
        'name',
        `creative{${creativeFields}}`,
        `insights.date_preset(${datePreset}){${insightFields}}`,
      ].join(','),
      limit:        '200',
      access_token: META_ACCESS_TOKEN,
      action_attribution_windows: JSON.stringify(['7d_click']),
    });

    const url = `${BASE_URL}/${META_AD_ACCOUNT_ID}/ads?${params.toString()}`;
    const res  = await fetch(url, { next: { revalidate: 600 } }); // 10 min cache
    const json = await res.json();

    if (json.error) {
      return NextResponse.json(
        { error: `Meta API: ${json.error.message} (code ${json.error.code})` },
        { status: 400 },
      );
    }

    const ads: RawAd[] = json.data ?? [];

    // ── Group ads by creative → build (frequency, ctr, cvr) data points ──
    //
    // Strategy: each ad using the same creative but in a different adset/audience
    // accumulates a different aggregate frequency. We collect all (freq, ctr, cvr)
    // pairs per creative and sort by frequency to build the fatigue curve.
    //
    // We bucket frequency into 0.5 steps and average metrics per bucket.

    type FreqKey = string; // `${creativeId}::${roundedFreq}`
    const buckets = new Map<FreqKey, {
      creativeId:   string;
      creativeName: string;
      freq:         number;
      impressions:  number;
      clicks:       number;
      conversions:  number;
    }>();

    for (const ad of ads) {
      const ins = ad.insights?.data[0];
      if (!ins) continue;

      const spend       = parseFloat(ins.spend ?? '0')      || 0;
      const impressions = parseInt(ins.impressions ?? '0', 10) || 0;
      const clicks      = parseInt(ins.clicks ?? '0', 10)     || 0;
      const frequency   = parseFloat(ins.frequency ?? '0')   || 0;
      const conversions = getActionValue(ins.actions, '7d_click');

      // Skip ads with no impressions or zero frequency
      if (impressions === 0 || frequency === 0 || spend === 0) continue;

      const creativeId   = ad.creative?.id ?? `ad_${ad.id}`;
      const creativeName = ad.creative?.name ?? ad.creative?.title ?? ad.name ?? creativeId;
      const roundedFreq  = Math.max(1.0, Math.min(6.0, roundHalf(frequency)));
      const key: FreqKey = `${creativeId}::${roundedFreq}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.impressions  += impressions;
        existing.clicks       += clicks;
        existing.conversions  += conversions;
      } else {
        buckets.set(key, {
          creativeId,
          creativeName,
          freq: roundedFreq,
          impressions,
          clicks,
          conversions,
        });
      }
    }

    // Convert to output format
    const points: CreativeFatiguePoint[] = [];
    for (const b of buckets.values()) {
      const ctr = b.impressions > 0 ? b.clicks / b.impressions : 0;
      const cvr = b.clicks > 0 ? b.conversions / b.clicks : 0;
      points.push({
        creativeId:   b.creativeId,
        creativeName: b.creativeName,
        frequency:    b.freq,
        ctr,
        cvr,
        impressions:  b.impressions,
      });
    }

    // Sort: creativeId ASC, frequency ASC
    points.sort((a, b) =>
      a.creativeId.localeCompare(b.creativeId) || a.frequency - b.frequency,
    );

    // Only keep creatives that have ≥ 2 distinct frequency data points
    const freqCountByCreative = new Map<string, number>();
    for (const p of points) {
      freqCountByCreative.set(p.creativeId, (freqCountByCreative.get(p.creativeId) ?? 0) + 1);
    }
    const filtered = points.filter((p) => (freqCountByCreative.get(p.creativeId) ?? 0) >= 2);

    return NextResponse.json({ data: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: `Impossible de joindre Meta API : ${message}` }, { status: 503 });
  }
}
