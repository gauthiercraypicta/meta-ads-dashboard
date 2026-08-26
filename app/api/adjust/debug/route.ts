import { NextResponse } from 'next/server';

const KPI_BASE_URL = 'https://api.adjust.com/kpis/v1';
const REPORT_URL   = 'https://dash.adjust.com/control-center/reports-service/report';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ error: 'Variables manquantes' }, { status: 503 });
  }

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];

  // Call KPI Service v1 (what Adjust UI uses) + Reports Service side-by-side for comparison
  const results: Record<string, unknown>[] = [];

  for (const appToken of appTokens) {
    // KPI Service
    const kpiParams = new URLSearchParams({
      start_date: weekAgo, end_date: today,
      kpis: 'installs,clicks,impressions,cost',
      grouping: 'day', period: 'day',
    });
    const kpiUrl = `${KPI_BASE_URL}/${appToken}.json?${kpiParams}`;
    const kpiRes  = await fetch(kpiUrl, { headers: { Authorization: `Bearer ${apiToken}` } });
    const kpiBody = await kpiRes.json() as {
      result_parameters?: { kpis: string[] };
      result_set?: { token: string; name: string; dates?: { date: string; kpi_values: number[] }[] };
    };

    const kpis    = kpiBody.result_parameters?.kpis ?? [];
    const iI      = kpis.indexOf('installs');
    const kpiDays = (kpiBody.result_set?.dates ?? []).map(d => ({
      date:     d.date,
      installs: iI >= 0 ? d.kpi_values[iI] : null,
    }));
    const kpiTotal = kpiDays.reduce((s, d) => s + (d.installs ?? 0), 0);

    // Reports Service (same period)
    const rptUrl = `${REPORT_URL}?app_token[]=${appToken}&date_period=${weekAgo}:${today}&dimensions=day,campaign&metrics=installs&limit=5000`;
    const rptRes  = await fetch(rptUrl, { headers: { Authorization: `Bearer ${apiToken}` } });
    const rptBody = await rptRes.json() as { rows?: { day?: string; installs?: number }[] };
    const rptTotal = (rptBody.rows ?? []).reduce((s, r) => s + Number(r.installs ?? 0), 0);

    results.push({
      appToken,
      appName:       kpiBody.result_set?.name,
      period:        `${weekAgo} → ${today}`,
      kpiServiceTotal:     kpiTotal,
      reportsServiceTotal: rptTotal,
      gap:                 kpiTotal - rptTotal,
      kpiDays,
    });
  }

  return NextResponse.json({ results });
}
