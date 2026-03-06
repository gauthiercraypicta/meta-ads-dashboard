// ─── Copy angle classification ────────────────────────────────────────────────
export type CopyAngle =
  | 'promotion'    // discounts, price, sale, deal
  | 'lifestyle'    // emotions, family, memories, love
  | 'product'      // quality, features, specs
  | 'social_proof' // reviews, trusted-by, million customers
  | 'urgency'      // limited time, today only, ends soon
  | 'occasion'     // Mother's Day, Christmas, graduation
  | 'other';

export type AdTone = 'emotional' | 'functional' | 'playful' | 'premium';

// ─── Individual ad from Ad Library ────────────────────────────────────────────
export interface AdLibraryAd {
  id: string;
  pageId: string;
  pageName: string;
  body: string;
  title?: string;
  cta: string;
  snapshotUrl?: string;
  deliveryStart: string;   // ISO date string
  ageDays: number;
  isActive: boolean;
  platforms: string[];
  impressionsLow: number;
  impressionsHigh: number;
  spendLow: number;
  spendHigh: number;
  // Claude / regex analysis
  angle: CopyAngle;
  hasDiscount: boolean;
  discountPct: number | null;
  tone: AdTone;
  keywords: string[];
}

// ─── Brand configuration ──────────────────────────────────────────────────────
export interface BrandConfig {
  id: string;
  name: string;
  pageId: string;
  color: string;
}

// ─── Aggregated brand summary ─────────────────────────────────────────────────
export interface BrandSummary {
  brand: BrandConfig;
  totalAds: number;
  activeAds: number;
  avgAgeDays: number;
  longestRunningDays: number;
  ctas: Record<string, number>;            // CTA type → count (active ads)
  angles: Record<CopyAngle, number>;       // angle → count (all ads)
  topAngle: CopyAngle;                     // dominant angle among active ads
  promotionPct: number;                    // % of all ads with promotion angle
  emotionalPct: number;                    // % of all ads with lifestyle + occasion angle
  totalSpendLow: number;
  totalSpendHigh: number;
  ads: AdLibraryAd[];
}

// ─── Top-level veille response ────────────────────────────────────────────────
export interface VeilleData {
  brands: BrandSummary[];
  fetchedAt: string;
  source: 'live' | 'mock';
}
