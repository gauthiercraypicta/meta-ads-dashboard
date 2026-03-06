import type { AdSetDataPoint }         from '@/components/charts/ScatterAdSetEfficiency';
import type { HeatmapCell }             from '@/components/charts/HeatmapHourDay';
import type { CreativeFrequencyPoint }  from '@/components/charts/CreativeFatigueCurve';
import type { FunnelData, IndustryBenchmarks } from '@/components/charts/ConversionFunnelVisual';
import type { DailyPerf }              from '@/components/charts/BudgetProjectionScenarios';

// ─── ScatterAdSetEfficiency ───────────────────────────────────────────────────

export const mockAdSetScatterData: AdSetDataPoint[] = [
  { name: 'Retargeting — 7j',       spend: 4200,  roas: 4.1, conversions: 180, frequency: 3.2 },
  { name: 'LAL 1% Acheteurs',        spend: 6800,  roas: 3.5, conversions: 210, frequency: 1.8 },
  { name: 'Intérêts — Fitness',      spend: 3100,  roas: 2.8, conversions: 95,  frequency: 2.1 },
  { name: 'Broad — 25–44',           spend: 7500,  roas: 2.2, conversions: 140, frequency: 1.4 },
  { name: 'Retargeting — 30j',       spend: 2900,  roas: 3.9, conversions: 65,  frequency: 4.1 },
  { name: 'LAL 3% Visiteurs',        spend: 5400,  roas: 2.6, conversions: 88,  frequency: 1.2 },
  { name: 'Intérêts — Nutrition',    spend: 1800,  roas: 1.6, conversions: 32,  frequency: 2.8 },
  { name: 'Engagés — 90j',           spend: 3700,  roas: 4.4, conversions: 156, frequency: 3.7 },
  { name: 'Broad — 45–65',           spend: 4900,  roas: 1.9, conversions: 61,  frequency: 1.6 },
  { name: 'LAL 5% CA',               spend: 6200,  roas: 2.4, conversions: 110, frequency: 1.1 },
  { name: 'Intérêts — Sport',        spend: 2300,  roas: 3.2, conversions: 78,  frequency: 2.3 },
  { name: 'Retargeting — ATC',       spend: 1500,  roas: 5.1, conversions: 220, frequency: 2.9 },
];

// ─── HeatmapHourDay ───────────────────────────────────────────────────────────

function rng(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const t = x - Math.floor(x);
  return min + t * (max - min);
}

export const mockHeatmapData: HeatmapCell[] = [];
for (let day = 0; day < 7; day++) {
  for (let hour = 0; hour < 24; hour++) {
    const seed    = day * 100 + hour;
    const isNight = hour < 6 || hour > 22;
    const isPrime = (hour >= 7 && hour <= 9) || (hour >= 19 && hour <= 21);

    const spendBase = isNight ? 5 : isPrime ? 80 : 35;
    const roasBase  = isNight ? 1.1 : isPrime ? 3.8 : 2.5;
    const convBase  = isNight ? 0.5 : isPrime ? 8 : 3;

    const spend       = Math.max(0, spendBase + rng(seed + 1, -10, 20));
    const roas        = Math.max(0.5, roasBase + rng(seed + 2, -0.8, 0.8));
    const conversions = Math.round(Math.max(0, convBase + rng(seed + 3, -2, 4)));
    const ctr         = Math.max(0, 0.008 + rng(seed + 4, -0.005, 0.015));

    // Skip some cells randomly (no data)
    if (rng(seed + 5, 0, 1) < 0.08) continue;

    mockHeatmapData.push({
      day:  day as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      hour,
      roas,
      spend,
      conversions,
      ctr,
    });
  }
}

// ─── CreativeFatigueCurve ─────────────────────────────────────────────────────

const creatives = [
  { id: 'cr_001', name: 'Vidéo UGC — Témoignage',  baseCtr: 0.028, baseCvr: 0.12, fatiguePt: 2.5 },
  { id: 'cr_002', name: 'Carousel Produits',         baseCtr: 0.019, baseCvr: 0.09, fatiguePt: 3.0 },
  { id: 'cr_003', name: 'Image Statique — Promo',    baseCtr: 0.015, baseCvr: 0.07, fatiguePt: 2.0 },
  { id: 'cr_004', name: 'Vidéo Animée — Brand',      baseCtr: 0.022, baseCvr: 0.10, fatiguePt: 3.5 },
  { id: 'cr_005', name: 'Reel — Lifestyle',           baseCtr: 0.031, baseCvr: 0.14, fatiguePt: 2.5 },
];

const freqSteps = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export const mockCreativeFatigueData: CreativeFrequencyPoint[] = [];
for (const cr of creatives) {
  let prevCtr = cr.baseCtr;
  let prevCvr = cr.baseCvr;
  for (const freq of freqSteps) {
    const isFatigued = freq >= cr.fatiguePt;
    const decay = isFatigued ? 0.82 : 0.98;
    const noise = 1 + (Math.sin(freq * 13.7 + cr.baseCtr * 100) * 0.04);
    const ctr   = prevCtr * decay * noise;
    const cvr   = prevCvr * decay * noise;
    const impressions = Math.round(5000 / freq);
    mockCreativeFatigueData.push({
      creativeId:   cr.id,
      creativeName: cr.name,
      frequency:    freq,
      ctr,
      cvr,
      impressions,
    });
    prevCtr = ctr;
    prevCvr = cvr;
  }
}

// ─── ConversionFunnelVisual ───────────────────────────────────────────────────

export const mockFunnelData: FunnelData = {
  impressions: 842_000,
  clicks:      6_230,
  conversions: 487,
  revenue:     38_960,
  spend:       14_200,
};

export const mockFunnelBenchmarks: IndustryBenchmarks = {
  ctr: 0.009,  // 0.9%
  cvr: 0.10,   // 10%
};

// ─── BudgetProjectionScenarios ────────────────────────────────────────────────

function generateMonthlyData(): DailyPerf[] {
  const today  = new Date();
  const year   = today.getFullYear();
  const month  = today.getMonth();
  const dayNow = today.getDate();
  const result: DailyPerf[] = [];

  let trendRoas = 2.8;
  for (let d = 1; d < dayNow; d++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const noise = 1 + (Math.sin(d * 2.3) * 0.15);
    const spend = Math.max(400, 1200 * noise + (d > 10 ? 200 : 0));
    trendRoas   = Math.max(1.5, trendRoas + (Math.sin(d * 1.7) * 0.1));
    const revenue = spend * trendRoas * (1 + Math.sin(d * 3.1) * 0.05);
    result.push({ date, spend, revenue, roas: revenue / spend });
  }
  return result;
}

export const mockDailyPerfData: DailyPerf[] = generateMonthlyData();
export const mockMonthlyBudget = 35_000;
