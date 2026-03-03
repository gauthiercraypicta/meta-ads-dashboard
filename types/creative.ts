export interface AdCreative {
  id: string;
  name?: string;
  object_type?: string;   // VIDEO | IMAGE | SHARE | DYNAMIC | LINK | TEXT
  thumbnail_url?: string;
  image_url?: string;
  body?: string;
  title?: string;
  call_to_action_type?: string;
  video_id?: string;
}

export interface AdInsightAction {
  action_type: string;
  value: string;
}

export interface AdInsight {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: AdInsightAction[];
  action_values?: AdInsightAction[];
  purchase_roas?: AdInsightAction[];
}

export interface AdData {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED' | string;
  created_time: string;
  creative?: AdCreative;
  insights?: {
    data: AdInsight[];
  };
}

// ─── Parsed creative (enriched, used by UI) ───────────────────────────────────

export type CreativeFormat = 'VIDEO' | 'IMAGE' | 'SHOPPING' | 'UNKNOWN';

export type CreativeSignal = 'SCALE' | 'WATCH' | 'FATIGUE' | 'CUT' | 'NEW';

export interface ParsedCreative {
  id: string;
  rawName: string;
  creativeName: string;   // parsed segment from naming convention
  campaign: string;       // e.g. "evergreenfeb"
  launchDate: string;     // "DD/MM/YY" from name prefix
  ageDays: number;        // since created_time
  format: CreativeFormat;
  hasPromo: boolean;
  isCopy: boolean;
  status: string;
  thumbnailUrl: string | null;
  // metrics
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  frequency: number;
  purchases: number;
  // signal
  signal: CreativeSignal;
}
