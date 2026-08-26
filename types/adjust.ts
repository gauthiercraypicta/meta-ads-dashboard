export interface AdjustDailyRow {
  date: string;
  appToken: string;
  appName: string;
  campaignToken: string;
  campaignName: string;
  installs: number;
  clicks: number;
  impressions: number;
  cost: number;
  sessions: number;
  engagement: number;          // install_engagement event count
  cartAdd: number;             // Add to cart (non-unique)
  checkout: number;            // Checkout (non-unique)
  orderPlace: number;          // Order placed (non-unique)
  timeSpent: number;           // session_length total seconds
  productDetailOpen: number;   // product_detail_open (non-unique)
  cartAddUnique: number;       // cart_item_add_unique
  checkoutUnique: number;      // order_checkout_unique
  orderPlaceUnique: number;    // order_placed_unique
  productDetailOpenUnique: number; // product_detail_open_unique
}

export interface AdjustCampaignSummary {
  token: string;
  name: string;
  appName: string;
  installs: number;
  clicks: number;
  impressions: number;
  cost: number;
  sessions: number;
  engagement: number;
  cartAdd: number;
  checkout: number;
  orderPlace: number;
  timeSpent: number;
  productDetailOpen: number;
  cartAddUnique: number;
  checkoutUnique: number;
  orderPlaceUnique: number;
  productDetailOpenUnique: number;
  cpi: number;
  ctr: number;
  cpm: number;
  cpiEngagement: number;  // cost / engagement
}

export interface AdjustTotals {
  installs: number;
  clicks: number;
  impressions: number;
  cost: number;
  sessions: number;
  engagement: number;
  cartAdd: number;
  checkout: number;
  orderPlace: number;
  timeSpent: number;
  productDetailOpen: number;
  cartAddUnique: number;
  checkoutUnique: number;
  orderPlaceUnique: number;
  productDetailOpenUnique: number;
  cpi: number;
  ctr: number;
  cpm: number;
  cpiEngagement: number;
}

export interface AdjustResponse {
  daily: AdjustDailyRow[];
  dailySimple: AdjustDailyRow[];   // ['day','app_token'] rows — no campaign split, no privacy suppression
  campaigns: AdjustCampaignSummary[];
  totals: AdjustTotals;
  prevTotals: AdjustTotals | null;
  apps: { token: string; name: string }[];
  currency: string;
  genericPrevTotals:   AdjustTotals | null;
  iconicPrevTotals:    AdjustTotals | null;
  otherPaidPrevTotals: AdjustTotals | null;
  noncampPrevTotals:   AdjustTotals | null;
}
