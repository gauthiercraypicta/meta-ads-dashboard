import { ActionData, InsightData, ProcessedMetrics } from '@/types/meta';

/**
 * Priority order for purchase action types.
 * We take the FIRST matching type only to avoid double-counting:
 * Meta often returns the same purchase event under several names
 * (omni_purchase, offsite_conversion.fb_pixel_purchase, purchase).
 * Summing all of them inflates conversions & revenue by 2-3×.
 */
const PURCHASE_ACTION_PRIORITY = [
  'omni_purchase',                          // canonical all-channel purchase (preferred)
  'offsite_conversion.fb_pixel_purchase',   // pixel-only fallback
  'purchase',                               // legacy / generic fallback
];

/** Returns the value for the highest-priority purchase action type found. */
function pickPurchaseValue(actions: ActionData[] | undefined): number {
  if (!actions) return 0;
  for (const type of PURCHASE_ACTION_PRIORITY) {
    const match = actions.find((a) => a.action_type === type);
    if (match) return parseFloat(match.value || '0');
  }
  return 0;
}

export function processInsights(insight: InsightData | undefined): ProcessedMetrics {
  if (!insight) {
    return {
      spend: 0, impressions: 0, reach: 0, clicks: 0,
      ctr: 0, cpc: 0, cpm: 0, conversions: 0,
      conversionValue: 0, roas: 0, frequency: 0, cpa: 0,
    };
  }

  const spend = parseFloat(insight.spend || '0');
  const impressions = parseInt(insight.impressions || '0', 10);
  const reach = parseInt(insight.reach || '0', 10);
  const clicks = parseInt(insight.clicks || '0', 10);

  // Use priority pick — never sum multiple types for the same event
  const conversions = pickPurchaseValue(insight.actions);
  const conversionValue = pickPurchaseValue(insight.action_values);

  // Always derive ROAS from conversionValue / spend for consistency with
  // computeTotals (which also uses conversionValue / spend).
  // Ignoring purchase_roas[0] avoids mismatches when Meta returns per-action-type
  // ROAS values in a different order between periods.
  const roas = spend > 0 && conversionValue > 0 ? conversionValue / spend : 0;

  const frequency = parseFloat(insight.frequency || '0');
  const cpa = conversions > 0 ? spend / conversions : 0;

  return {
    spend,
    impressions,
    reach,
    clicks,
    ctr: parseFloat(insight.ctr || '0'),
    cpc: parseFloat(insight.cpc || '0'),
    cpm: parseFloat(insight.cpm || '0'),
    conversions,
    conversionValue,
    roas,
    frequency,
    cpa,
  };
}

export function computeTotals(metrics: ProcessedMetrics[]): ProcessedMetrics {
  const agg = metrics.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      impressions: acc.impressions + m.impressions,
      reach: acc.reach + m.reach,
      clicks: acc.clicks + m.clicks,
      conversions: acc.conversions + m.conversions,
      conversionValue: acc.conversionValue + m.conversionValue,
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, conversionValue: 0 }
  );

  return {
    ...agg,
    ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
    cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
    cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
    roas: agg.spend > 0 ? agg.conversionValue / agg.spend : 0,
    cpa: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
    frequency: agg.reach > 0 ? agg.impressions / agg.reach : 0,
  };
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    DELETED: 'bg-red-100 text-red-800',
    ARCHIVED: 'bg-gray-100 text-gray-600',
    WITH_ISSUES: 'bg-orange-100 text-orange-800',
    CAMPAIGN_PAUSED: 'bg-yellow-100 text-yellow-800',
    ADSET_PAUSED: 'bg-yellow-100 text-yellow-800',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-600';
}
