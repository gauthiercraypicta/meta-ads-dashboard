import { NextResponse } from 'next/server';

const DASH_RS = 'https://dash.adjust.com/control-center/reports-service';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ error: 'Variables manquantes' }, { status: 503 });
  }

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const app     = appTokens[0];

  type C = { label: string; url: string; headers: Record<string, string> };
  const candidates: C[] = [
    // The correct base URL found via Airbyte docs
    { label: 'dash RS/report Bearer',         url: `${DASH_RS}/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,         headers: { Authorization: `Bearer ${apiToken}` } },
    { label: 'dash RS/report Token token=',   url: `${DASH_RS}/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,         headers: { Authorization: `Token token=${apiToken}` } },
    { label: 'dash RS/filters_data (probe)',  url: `${DASH_RS}/filters_data?required_filters=event_metrics`,                                                                       headers: { Authorization: `Bearer ${apiToken}` } },
    // CANARY: old kpis/v1 (doit toujours être 410)
    { label: 'CANARY kpis/v1',                url: `https://api.adjust.com/kpis/v1/${app}?start_date=${weekAgo}&end_date=${today}&kpis=installs&grouping=day`,                    headers: { Authorization: `Token token=${apiToken}` } },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const res  = await fetch(c.url, { headers: c.headers });
      const body = await res.text().catch(() => '');
      return { label: c.label, status: res.status, body: body.slice(0, 500) };
    } catch (e) {
      return { label: c.label, status: null, body: String(e).slice(0, 200) };
    }
  }));

  return NextResponse.json({ today, app, results });
}
