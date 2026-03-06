// ─── Severity ─────────────────────────────────────────────────────────────────
// Red    = spend > 500 AND roas < 2.22
// Orange = deltaRoas < -15 % OR (roas < 2.22 AND spend ≤ 500)
// Green  = roas ≥ 2.22 AND deltaRoas > 0
export type Severity = 'green' | 'orange' | 'red';

// ─── Processed ad set (after Meta fetch + delta computation) ─────────────────
export interface ProcessedAdSet {
  adsetId: string;
  adsetName: string;
  campaignName: string;
  // Current 7-day
  spend: number;
  roas: number;
  cpa: number;
  purchases: number;
  purchaseValue: number;
  impressions: number;
  clicks: number;
  cpm: number;
  ctr: number;
  // Previous 7-day
  prevSpend: number;
  prevRoas: number;
  prevPurchases: number;
  // Deltas (ratio: 0.15 = +15 %)
  deltaSpend: number;
  deltaRoas: number;
  // Signal
  severity: Severity;
  signal: string;      // 1-sentence Claude insight
}

// ─── Top-level digest response ────────────────────────────────────────────────
export interface DigestData {
  synthesis: string;       // Claude narrative summary
  adsets: ProcessedAdSet[];
  fetchedAt: string;
}

// ─── Crea-level data (on-demand per ad set) ───────────────────────────────────
export interface CreaAd {
  adId: string;
  adName: string;
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  purchases: number;
  thumbnailUrl?: string;
  body?: string;
  title?: string;
}

export interface CreaData {
  adsetId: string;
  adsetName: string;
  ads: CreaAd[];
  analysis: string;   // Claude crea bullet-point analysis
}
