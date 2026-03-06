import { NextResponse } from 'next/server';
import type { CreaAd, CreaData } from '@/types/digest';

const API_VER  = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VER}`;

const META_TOKEN    = () => process.env.META_ACCESS_TOKEN!;
const ACCOUNT_ID    = () => process.env.META_AD_ACCOUNT_ID!;
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY ?? '';

// ─── Helpers ───────────────────────────────────────────────────────────────────
interface RawAction { action_type: string; value: string }

function actionVal(arr: RawAction[] = [], type: string): number {
  const hit = arr.find((a) => a.action_type === type);
  return hit ? parseFloat(hit.value) : 0;
}

// ─── Claude ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un expert Media Buyer Meta Ads senior.
Tu analyses des données d'ad sets Meta pour un compte e-commerce photo printing (US).
Break-even ROAS = 2.22x. Marge brute = 45%.
ROI = (revenue × 0.45 - spend) / spend.
Règles strictes :
- Tu ne commentes QUE ce que les chiffres confirment
- Chaque insight = [observation] + [métrique qui le prouve] + [recommandation courte]
- Si rien de notable : réponds "Stable, aucune alerte"
- Pas de formules génériques type "il est important de surveiller..."
- Tu parles à un paid media senior : va droit au but
- Réponds en français`;

async function callClaude(userPrompt: string): Promise<string> {
  const key = ANTHROPIC_KEY();
  if (!key) return 'Analyse indisponible (clé API Anthropic manquante).';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 512,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) return 'Analyse indisponible (erreur API Anthropic).';
    const data = await res.json();
    return data.content?.[0]?.text ?? 'Analyse indisponible.';
  } catch {
    return 'Analyse indisponible (timeout ou réseau).';
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const adsetId   = searchParams.get('adsetId')   ?? '';
  const adsetName = searchParams.get('adsetName') ?? '';

  if (!adsetId) {
    return NextResponse.json({ error: 'adsetId manquant.' }, { status: 400 });
  }

  const acct = ACCOUNT_ID();
  if (!acct) {
    return NextResponse.json({ error: 'META_AD_ACCOUNT_ID non configuré.' }, { status: 500 });
  }

  // ── Fetch ad-level data (ads with inline insights + creative) ──────────────
  const creativeFields = 'thumbnail_url,body,title';
  const insightFields  = 'spend,impressions,clicks,actions,action_values,ctr,cpm';

  const params = new URLSearchParams({
    filtering:    JSON.stringify([{ field: 'adset.id', operator: 'IN', value: [adsetId] }]),
    fields: [
      'id',
      'name',
      `creative{${creativeFields}}`,
      `insights.date_preset(last_7d){${insightFields}}`,
    ].join(','),
    limit:        '50',
    access_token: META_TOKEN(),
  });

  let ads: CreaAd[] = [];

  try {
    const res  = await fetch(`${BASE_URL}/${acct}/ads?${params}`, { cache: 'no-store' });
    const json = await res.json();

    if (!json.error && Array.isArray(json.data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ads = (json.data as any[])
        .map((ad) => {
          const ins         = ad.insights?.data?.[0];
          const spend       = parseFloat(ins?.spend ?? '0');
          const purchases   = actionVal(ins?.actions, 'purchase');
          const purchaseVal = actionVal(ins?.action_values, 'purchase');
          const roas        = spend > 0 ? purchaseVal / spend : 0;
          const cpa         = purchases > 0 ? spend / purchases : 0;
          const ctr         = parseFloat(ins?.ctr ?? '0');

          return {
            adId:         ad.id ?? '',
            adName:       ad.name ?? '',
            spend,
            roas,
            cpa,
            ctr,
            purchases,
            thumbnailUrl: ad.creative?.thumbnail_url,
            body:         ad.creative?.body,
            title:        ad.creative?.title,
          } satisfies CreaAd;
        })
        .filter((a) => a.spend > 0)
        .sort((a, b) => b.spend - a.spend);
    }
  } catch {
    // fallback: empty ads, Claude will note it
  }

  // ── Build crea prompt ──────────────────────────────────────────────────────
  const creaJson = JSON.stringify(
    ads.map((a) => ({
      ad_id:      a.adId,
      ad_name:    a.adName,
      spend:      +a.spend.toFixed(0),
      roas:       +a.roas.toFixed(2),
      cpa:        +a.cpa.toFixed(2),
      ctr:        +a.ctr.toFixed(2),
      purchases:  a.purchases,
      has_copy:   Boolean(a.body || a.title),
    })),
    null,
    2,
  );

  const prompt = ads.length > 0
    ? `Voici les performances des ads de l'ad set "${adsetName}" :\n${creaJson}\nAnalyse les créas. Identifie la/les meilleures et explique pourquoi en 3 bullets max.`
    : `Aucune ad active trouvée pour l'ad set "${adsetName}" sur les 7 derniers jours. Indique-le brièvement.`;

  const analysis = await callClaude(prompt);

  const result: CreaData = { adsetId, adsetName, ads, analysis };
  return NextResponse.json(result);
}
