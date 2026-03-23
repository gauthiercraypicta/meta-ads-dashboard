import { NextResponse } from 'next/server';

const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN!;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;
const API_VER            = 'v21.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdHealthItem {
  adId:        string;
  adName:      string;
  createdTime: string;                               // ISO "YYYY-MM-DD"
  format:      'VIDEO' | 'IMAGE' | 'SHOPPING' | 'UNKNOWN';
  launchDate:  string;                               // "YYYY-MM-DD" from naming convention, or ""
  weeklyData:  { weekStart: string; spend: number }[];
}

export interface CreativeHealthData {
  items:     AdHealthItem[];
  fetchedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectFormat(
  name: string,
  creative?: { object_type?: string; video_id?: string },
): 'VIDEO' | 'IMAGE' | 'SHOPPING' | 'UNKNOWN' {
  const lower = name.toLowerCase();
  const parts = name.split('_');
  if (parts.length >= 3) {
    const fmt = parts[2].toLowerCase();
    if (fmt === 'video')                                    return 'VIDEO';
    if (fmt === 'static')                                   return 'IMAGE';
    if (fmt === 'shoppingfeed' || fmt === 'shopping' || fmt === 'dpa') return 'SHOPPING';
  }
  if (lower.includes('shoppingfeed'))                       return 'SHOPPING';
  const objType = creative?.object_type?.toUpperCase() ?? '';
  if (creative?.video_id || objType.includes('VIDEO'))      return 'VIDEO';
  if (objType === 'DYNAMIC')                                return 'SHOPPING';
  if (objType === 'IMAGE' || objType === 'LINK' || objType === 'SHARE') return 'IMAGE';
  return 'UNKNOWN';
}

// "YYMMDD_..." → "YYYY-MM-DD", or ""
function parseLaunchDate(name: string): string {
  const parts = name.split('_');
  if (parts.length >= 2 && /^\d{6}$/.test(parts[0])) {
    const d = parts[0]; // YYMMDD
    return `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  }
  return '';
}

// Paginated fetch — stops at maxPages to stay within Vercel timeout
async function fetchAllPages<T>(
  url: string,
  maxPages = 8,
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    const res  = await fetch(nextUrl, { next: { revalidate: 300 } });
    const data = await res.json() as { data?: T[]; paging?: { next?: string } };
    if (data.data) results.push(...data.data);
    nextUrl = data.paging?.next ?? null;
    pages++;
  }
  return results;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const base = `https://graph.facebook.com/${API_VER}/${META_AD_ACCOUNT_ID}`;

    // Explicit time_range including today
    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get('date_preset') ?? 'last_90d';
    const today = new Date();
    let sinceDate: string;
    if (datePreset === 'since_dec_1') {
      sinceDate = '2025-12-01';
    } else {
      let days = 90;
      if (datePreset === 'last_7d') days = 7;
      else if (datePreset === 'last_30d') days = 30;
      const since = new Date(today); since.setDate(today.getDate() - days);
      sinceDate = since.toISOString().split('T')[0];
    }
    const timeRange = JSON.stringify({
      since: sinceDate,
      until: today.toISOString().split('T')[0],
    });

    // ── 1 & 2. Fetch ads metadata + weekly insights in parallel ─────────────
    const [adsMeta, rawInsights] = await Promise.all([
      fetchAllPages<{
        id:           string;
        name:         string;
        created_time: string;
        creative?:    { object_type?: string; video_id?: string };
      }>(
        `${base}/ads?${new URLSearchParams({
          fields:       'id,name,created_time,creative{object_type,video_id}',
          limit:        '200',
          access_token: META_ACCESS_TOKEN,
        })}`,
        5,
      ),
      fetchAllPages<{
        ad_id:      string;
        spend:      string;
        date_start: string;
      }>(
        `${base}/insights?${new URLSearchParams({
          level:          'ad',
          time_range:     timeRange,
          time_increment: '7',
          fields:         'ad_id,spend,date_start',
          limit:          '5000',
          access_token:   META_ACCESS_TOKEN,
        })}`,
        8,
      ),
    ]);

    // ── 3. Build ad metadata map ─────────────────────────────────────────────
    type AdMeta = {
      name:        string;
      createdTime: string;
      format:      'VIDEO' | 'IMAGE' | 'SHOPPING' | 'UNKNOWN';
      launchDate:  string;
    };
    const metaMap = new Map<string, AdMeta>();
    for (const ad of adsMeta) {
      metaMap.set(ad.id, {
        name:        ad.name,
        createdTime: ad.created_time.slice(0, 10), // "YYYY-MM-DD"
        format:      detectFormat(ad.name, ad.creative),
        launchDate:  parseLaunchDate(ad.name),
      });
    }

    // ── 4. Group insights by ad ──────────────────────────────────────────────
    const insightsMap = new Map<string, { weekStart: string; spend: number }[]>();
    for (const row of rawInsights) {
      const spend = parseFloat(row.spend ?? '0');
      if (spend <= 0) continue;
      const existing = insightsMap.get(row.ad_id) ?? [];
      existing.push({ weekStart: row.date_start, spend });
      insightsMap.set(row.ad_id, existing);
    }

    // ── 5. Merge ──────────────────────────────────────────────────────────────
    const items: AdHealthItem[] = [];
    for (const [adId, weekly] of insightsMap.entries()) {
      const meta = metaMap.get(adId);
      if (!meta) continue; // ad not in metadata (edge case)
      items.push({
        adId,
        adName:      meta.name,
        createdTime: meta.createdTime,
        format:      meta.format,
        launchDate:  meta.launchDate,
        weeklyData:  weekly.sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      });
    }

    return NextResponse.json({
      items,
      fetchedAt: new Date().toISOString(),
    } satisfies CreativeHealthData);

  } catch (err) {
    return NextResponse.json(
      { error: `Erreur serveur: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
