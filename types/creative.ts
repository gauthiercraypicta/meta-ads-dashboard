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
  '7d_click'?: string;
  '1d_view'?: string;
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
  video_play_actions?: AdInsightAction[];
  video_thruplay_watched_actions?: AdInsightAction[];
}

export interface AdData {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED' | string;
  created_time: string;
  adset_id?: string;
  adset?: { id: string; name: string };
  creative?: AdCreative;
  insights?: {
    data: AdInsight[];
  };
}

// ─── Parsed creative (enriched, one row per ad) ───────────────────────────────

export type CreativeFormat = 'VIDEO' | 'IMAGE' | 'SHOPPING' | 'UNKNOWN';

export type CreativeSignal = 'SCALE' | 'WATCH' | 'FATIGUE' | 'CUT' | 'NEW';

export interface ParsedCreative {
  id: string;             // ad id
  creativeId: string;     // creative.id — grouping key
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
  // ad set
  adSetId: string;
  adSetName: string;
  // metrics
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  frequency: number;
  purchases: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchaseValue: number;  // for proper ROAS aggregation
  // video metrics
  videoViews3s: number;
  thruplay: number;
  hookRate: number;       // videoViews3s / impressions × 100
  holdRate: number;       // thruplay / videoViews3s × 100
  // signal
  signal: CreativeSignal;
}

// ─── Grouped creative (one row per unique creative, aggregated across ad sets) ─

export interface GroupedCreative {
  creativeId: string;
  rawName: string;
  creativeName: string;
  campaign: string;
  launchDate: string;
  ageDays: number;
  format: CreativeFormat;
  hasPromo: boolean;
  isCopy: boolean;
  thumbnailUrl: string | null;
  // aggregated metrics
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  frequency: number;
  purchases: number;
  reach: number;
  impressions: number;
  clicks: number;
  // video metrics
  videoViews3s: number;
  thruplay: number;
  hookRate: number;
  holdRate: number;
  signal: CreativeSignal;
  // individual ad rows
  variants: ParsedCreative[];
}
