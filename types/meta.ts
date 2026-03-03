export interface ActionData {
  action_type: string;
  value: string;
  '1d_click'?: string;
  '7d_click'?: string;
  '28d_click'?: string;
  '1d_view'?: string;
}

export interface InsightData {
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  frequency?: string;
  actions?: ActionData[];
  action_values?: ActionData[];
  purchase_roas?: ActionData[];
  date_start?: string;
  date_stop?: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  insights?: {
    data: InsightData[];
    paging?: unknown;
  };
}

export interface AdSet {
  id: string;
  name: string;
  status: string;
  campaign_id?: string;
  insights?: {
    data: InsightData[];
    paging?: unknown;
  };
}

export interface MetaApiResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export interface ProcessedMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  conversionValue: number;
  roas: number;
  frequency: number;
  cpa: number;
}

export interface ProcessedCampaign extends ProcessedMetrics {
  id: string;
  name: string;
  status: string;
  objective?: string;
}

export interface ProcessedAdSet extends ProcessedMetrics {
  id: string;
  name: string;
  status: string;
  campaign_id?: string;
}
