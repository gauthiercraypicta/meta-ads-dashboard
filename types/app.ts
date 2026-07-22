export interface AppDailyRow {
  date: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  frequency: number;
  installs: number;
  qualifiedInstalls: number;
}

export interface AppCampaignSummary {
  id: string;
  name: string;
  status: string;
  os: string; // 'ios' | 'android' | 'both' | 'unknown'
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  qualifiedInstalls: number;
  cpi: number;
  cpqi: number;
  ctr: number;
  cpm: number;
  cpc: number;
  installRate: number;
  qualRate: number;
}

export interface AppTotals {
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  qualifiedInstalls: number;
  cpi: number;
  cpqi: number;
  cpm: number;
  ctr: number;
  cpc: number;
  installRate: number;
  qualRate: number;
}

export interface AppDeviceRow {
  date: string;
  campaignId: string;
  campaignName: string;
  device: string; // 'mobile_phone_ios' | 'mobile_phone_android' | 'ipad' | 'desktop' | ...
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  qualifiedInstalls: number;
}

export interface AppInstallsResponse {
  daily: AppDailyRow[];
  campaigns: AppCampaignSummary[];
  totals: AppTotals;
  prevTotals: AppTotals | null;
  qualifiedInstallEvent: string;
  breakdown: AppDeviceRow[]; // par impression_device — sert au filtre iOS/Android
}
