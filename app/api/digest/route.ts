import { NextResponse } from 'next/server';
import type { ProcessedAdSet, DigestData, Severity } from '@/types/digest';

const API_VER  = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VER}`;
const BREAKEVEN_ROAS = 2.22;

// ─── Env ───────────────────────────────────────────────────────────────────────
const META_TOKEN   = () => process.env.META_ACCESS_TOKEN!;
const ACCOUNT_ID   = () => process.env.META_AD_ACCOUNT_ID!;
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY ?? '';

// ─── Insight field extraction ─────────────────────────────────────────────────
interface RawAction { action_type: string; value: string }

function actionVal(arr: RawAction[] = [], type: string): number {
  const hit = arr.find((a) => a.action_type === type);
  return hit ? parseFloat(hit.value) : 0;
}

interface RawInsights {
  adset_id?: string;
  adset_name?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpm?: string;
  ctr?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
}

function parseRow(raw: RawInsights) {
  const spend         = parseFloat(raw.spend ?? '0');
  const impressions   = parseFloat(raw.impressions ?? '0');
  const clicks        = parseFloat(raw.clicks ?? '0');
  const cpm           = parseFloat(raw.cpm ?? '0');
  const ctr           = parseFloat(raw.ctr ?? '0');
  const purchases     = actionVal(raw.actions, 'purchase');
  const purchaseValue = actionVal(raw.action_values, 'purchase');
  const roas          = spend > 0 ? purchaseValue / spend : 0;
  const cpa           = purchases > 0 ? spend / purchases : 0;

  return {
    adsetId:      raw.adset_id ?? '',
    adsetName:    raw.adset_name ?? '',
    campaignName: raw.campaign_name ?? '',
    spend, impressions, clicks, cpm, ctr, purchases, purchaseValue, roas, cpa,
  };
}

// ─── Meta Insights fetch ───────────────────────────────────────────────────────
const INSIGHT_FIELDS =
  'adset_id,adset_name,campaign_name,spend,impressions,clicks,actions,action_values,cpm,ctr,cpp';

async function fetchInsights(datePreset: 'last_7d' | 'last_14d') {
  const acct = ACCOUNT_ID();
  if (!acct) return [];

  const params = new URLSearchParams({
    level:       'adset',
    date_preset: datePreset,
    fields:      INSIGHT_FIELDS,
    limit:       '500',
    access_token: META_TOKEN(),
  });

  try {
    const res  = await fetch(`${BASE_URL}/${acct}/insights?${params}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.error || !Array.isArray(json.data)) return [];
    return json.data as RawInsights[];
  } catch {
    return [];
  }
}

// ─── Severity ─────────────────────────────────────────────────────────────────
function computeSeverity(spend: number, roas: number, deltaRoas: number): Severity {
  if (spend > 500 && roas < BREAKEVEN_ROAS)              return 'red';
  if (deltaRoas < -0.15 || (roas < BREAKEVEN_ROAS && spend <= 500)) return 'orange';
  return 'green';
}

// ─── Claude helper ─────────────────────────────────────────────────────────────
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

async function callClaude(userPrompt: string, maxTokens = 1024): Promise<string> {
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
        max_tokens: maxTokens,
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

// ─── JSON extraction from Claude response ────────────────────────────────────
interface ClaudeSignal { adset_id: string; signal: string; severity: string }

function parseSignalsJson(text: string): ClaudeSignal[] {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function GET() {
  // ── 1. Parallel Meta fetches ─────────────────────────────────────────────
  const [raw7d, raw14d] = await Promise.all([
    fetchInsights('last_7d'),
    fetchInsights('last_14d'),
  ]);

  if (raw7d.length === 0) {
    return NextResponse.json(
      { error: 'Aucune donnée Meta disponible pour la période last_7d.' },
      { status: 502 },
    );
  }

  // ── 2. Build adset map for 14d (for delta) ────────────────────────────────
  const map14d = new Map<string, ReturnType<typeof parseRow>>();
  for (const row of raw14d) {
    const parsed = parseRow(row);
    if (parsed.adsetId) map14d.set(parsed.adsetId, parsed);
  }

  // ── 3. Process each adset ─────────────────────────────────────────────────
  const adsets: ProcessedAdSet[] = raw7d
    .map(parseRow)
    .filter((a) => a.spend > 0)
    .map((cur) => {
      const total14 = map14d.get(cur.adsetId);

      // prev 7d = 14d aggregate minus current 7d
      const prevSpend         = total14 ? Math.max(0, total14.spend - cur.spend)         : 0;
      const prevPurchases     = total14 ? Math.max(0, total14.purchases - cur.purchases) : 0;
      const prevPurchaseValue = total14 ? Math.max(0, total14.purchaseValue - cur.purchaseValue) : 0;
      const prevRoas          = prevSpend > 0 ? prevPurchaseValue / prevSpend : 0;

      const deltaSpend = prevSpend > 0 ? (cur.spend - prevSpend) / prevSpend : 0;
      const deltaRoas  = prevRoas  > 0 ? (cur.roas  - prevRoas)  / prevRoas  : 0;

      const severity = computeSeverity(cur.spend, cur.roas, deltaRoas);

      return {
        ...cur,
        prevSpend,
        prevRoas,
        prevPurchases,
        deltaSpend,
        deltaRoas,
        severity,
        signal: '', // filled by Claude below
      };
    })
    .sort((a, b) => b.spend - a.spend); // sort by spend desc

  // ── 4. Build Claude prompts ────────────────────────────────────────────────

  // Totals for synthesis
  const totalSpend         = adsets.reduce((s, a) => s + a.spend, 0);
  const totalPrevSpend     = adsets.reduce((s, a) => s + a.prevSpend, 0);
  const totalPurchaseValue = adsets.reduce((s, a) => s + a.purchaseValue, 0);
  const totalPurchases     = adsets.reduce((s, a) => s + a.purchases, 0);
  const totalRoas          = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
  const totalCpa           = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const totalPrevPV        = adsets.reduce((s, a) => s + (a.prevRoas * a.prevSpend), 0);
  const totalPrevRoas      = totalPrevSpend > 0 ? totalPrevPV / totalPrevSpend : 0;
  const deltaSpendGlobal   = totalPrevSpend > 0 ? (totalSpend - totalPrevSpend) / totalPrevSpend : 0;
  const deltaRoasGlobal    = totalPrevRoas  > 0 ? (totalRoas - totalPrevRoas) / totalPrevRoas : 0;

  const aggregateJson = JSON.stringify({
    period: 'last_7d',
    totals: {
      spend:           Math.round(totalSpend),
      spend_delta_pct: +(deltaSpendGlobal * 100).toFixed(1),
      roas:            +totalRoas.toFixed(2),
      roas_delta_pct:  +(deltaRoasGlobal * 100).toFixed(1),
      purchases:       Math.round(totalPurchases),
      cpa:             +totalCpa.toFixed(2),
    },
    adsets_count: adsets.length,
    red_count:    adsets.filter((a) => a.severity === 'red').length,
    orange_count: adsets.filter((a) => a.severity === 'orange').length,
    green_count:  adsets.filter((a) => a.severity === 'green').length,
  }, null, 2);

  const signalsJson = JSON.stringify(
    adsets.map((a) => ({
      adset_id:        a.adsetId,
      adset_name:      a.adsetName,
      campaign_name:   a.campaignName,
      spend_7d:        +a.spend.toFixed(0),
      roas_7d:         +a.roas.toFixed(2),
      cpa_7d:          +a.cpa.toFixed(2),
      purchases_7d:    a.purchases,
      delta_roas_pct:  +(a.deltaRoas * 100).toFixed(1),
      delta_spend_pct: +(a.deltaSpend * 100).toFixed(1),
      severity:        a.severity,
    })),
    null,
    2,
  );

  // ── 5. Parallel Claude calls ───────────────────────────────────────────────
  const synthesisPrompt = `Voici les données agrégées du compte sur 7 jours vs 7 jours précédents :\n${aggregateJson}\nRédige une synthèse de 4-5 phrases. Mets en avant les signaux les plus importants.`;

  const signalsPrompt = `Voici les données de chaque ad set sur 7 jours avec delta vs semaine précédente :\n${signalsJson}\nPour chaque ad set, retourne un JSON array avec : adset_id, signal (1 phrase max), severity (green/orange/red).\nRéponds UNIQUEMENT avec le JSON, sans markdown.`;

  const [synthesis, signalsRaw] = await Promise.all([
    callClaude(synthesisPrompt, 512),
    callClaude(signalsPrompt, 2048),
  ]);

  // ── 6. Map signals → adsets ────────────────────────────────────────────────
  const signals = parseSignalsJson(signalsRaw);
  const signalMap = new Map<string, ClaudeSignal>(signals.map((s) => [s.adset_id, s]));

  const finalAdsets: ProcessedAdSet[] = adsets.map((a) => {
    const sig = signalMap.get(a.adsetId);
    return {
      ...a,
      signal:   sig?.signal   ?? 'Données insuffisantes.',
      severity: (sig?.severity as Severity | undefined) ?? a.severity,
    };
  });

  // ── 7. Return ──────────────────────────────────────────────────────────────
  const digest: DigestData = {
    synthesis,
    adsets: finalAdsets,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(digest);
}
