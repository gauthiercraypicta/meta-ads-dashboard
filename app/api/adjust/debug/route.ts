import { NextResponse } from 'next/server';

const REPORT_URL = 'https://dash.adjust.com/control-center/reports-service/report';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ error: 'Variables manquantes' }, { status: 503 });
  }

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const period  = `${weekAgo}:${today}`;
  const metrics = 'installs,clicks,impressions,cost';

  // Call 1: dimensions=day (no campaign) → grand total including organic
  const dayUrl  = `${REPORT_URL}?${appTokens.map(t => `app_token[]=${t}`).join('&')}&date_period=${period}&dimensions=day&metrics=${metrics}&limit=5000`;
  // Call 2: dimensions=day,campaign → per-campaign breakdown
  const campUrl = `${REPORT_URL}?${appTokens.map(t => `app_token[]=${t}`).join('&')}&date_period=${period}&dimensions=day,campaign&metrics=${metrics}&limit=5000`;

  const [dayRes, campRes] = await Promise.all([
    fetch(dayUrl,  { headers: { Authorization: `Bearer ${apiToken}` } }),
    fetch(campUrl, { headers: { Authorization: `Bearer ${apiToken}` } }),
  ]);

  const dayBody  = await dayRes.json()  as { rows?: { day?: string; installs?: number }[] };
  const campBody = await campRes.json() as { rows?: { day?: string; campaign?: string; installs?: number }[] };

  const dayTotal  = (dayBody.rows  ?? []).reduce((s, r) => s + Number(r.installs  ?? 0), 0);
  const campTotal = (campBody.rows ?? []).reduce((s, r) => s + Number(r.installs ?? 0), 0);

  return NextResponse.json({
    period:                `${weekAgo} → ${today}`,
    dayLevelTotal:         dayTotal,
    campaignLevelTotal:    campTotal,
    gap:                   dayTotal - campTotal,
    explanation:           'gap = organic/unattributed installs missing from campaign-level breakdown',
    dayRows:               dayBody.rows,
    topCampaigns: (campBody.rows ?? [])
      .reduce((acc: Record<string, number>, r) => {
        const k = r.campaign ?? '(none)';
        acc[k] = (acc[k] ?? 0) + Number(r.installs ?? 0);
        return acc;
      }, {}),
  });
}
