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
  cpi: number;
  ctr: number;
  cpm: number;
}

export interface AdjustTotals {
  installs: number;
  clicks: number;
  impressions: number;
  cost: number;
  sessions: number;
  cpi: number;
  ctr: number;
  cpm: number;
}

export interface AdjustResponse {
  daily: AdjustDailyRow[];
  campaigns: AdjustCampaignSummary[];
  totals: AdjustTotals;
  prevTotals: AdjustTotals | null;
  apps: { token: string; name: string }[];
  currency: string;
}
