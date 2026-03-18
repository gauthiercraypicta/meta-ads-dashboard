// ─── Copy angle classification ─────────────────────────────────────────────
export type CopyAngle =
  | 'promotion'
  | 'lifestyle'
  | 'product'
  | 'social_proof'
  | 'urgency'
  | 'occasion'
  | 'other';

export type AdTone = 'emotional' | 'functional' | 'playful' | 'premium';

export type AdStatus = 'ACTIVE' | 'INACTIVE';

// ─── Raw Meta Ad Library ad ────────────────────────────────────────────────
export interface CompetitorAd {
  id: string;
  pageId: string;
  pageName: string;
  body: string;
  title?: string;
  cta: string;
  snapshotUrl?: string;
  deliveryStart: string;
  deliveryStop?: string;
  ageDays: number;
  isActive: boolean;
  platforms: string[];
  impressionsLow: number;
  impressionsHigh: number;
  spendLow: number;
  spendHigh: number;
  // Analysis
  angle: CopyAngle;
  hasDiscount: boolean;
  discountPct: number | null;
  tone: AdTone;
  keywords: string[];
}

// ─── Brand / page config ───────────────────────────────────────────────────
export interface TrackedBrand {
  id: string;
  name: string;
  pageId: string;
  color: string;
}

// ─── Aggregated brand summary ──────────────────────────────────────────────
export interface BrandSummary {
  brand: TrackedBrand;
  totalAds: number;
  activeAds: number;
  avgAgeDays: number;
  longestRunningDays: number;
  ctas: Record<string, number>;
  angles: Record<CopyAngle, number>;
  topAngle: CopyAngle;
  promotionPct: number;
  emotionalPct: number;
  totalSpendLow: number;
  totalSpendHigh: number;
  ads: CompetitorAd[];
}

// ─── API response ──────────────────────────────────────────────────────────
export interface CompetitorData {
  brands: BrandSummary[];
  fetchedAt: string;
  source: 'live' | 'mock';
  query?: string;
  country?: string;
}

// ─── Search response ───────────────────────────────────────────────────────
export interface SearchResult {
  pageId: string;
  pageName: string;
  totalAds: number;
  activeAds: number;
  sampleAds: CompetitorAd[];
}
