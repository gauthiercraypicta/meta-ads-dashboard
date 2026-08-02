import { NextResponse } from 'next/server';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ error: 'Variables manquantes' }, { status: 503 });
  }

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const app     = appTokens[0];
  const base    = `start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`;
  const baseApp = `app_token[]=${app}&${base}`;
  const auth    = `Token token=${apiToken}`;

  // Test every plausible Adjust Report Service URL variant
  const candidates = [
    { label: 'CANARY kpis/v1',                url: `https://api.adjust.com/kpis/v1/${app}?start_date=${weekAgo}&end_date=${today}&kpis=installs&grouping=day`, auth },
    { label: 'reports-service/report',         url: `https://api.adjust.com/reports-service/report?${baseApp}`, auth },
    { label: 'reports-service/reports',        url: `https://api.adjust.com/reports-service/reports?${baseApp}`, auth },
    { label: 'reports-service/json-report',    url: `https://api.adjust.com/reports-service/json-report?${baseApp}`, auth },
    { label: 'reports-service/csv-report',     url: `https://api.adjust.com/reports-service/csv-report?${baseApp}`, auth },
    { label: 'reports-service/report.json',    url: `https://api.adjust.com/reports-service/report.json?${baseApp}`, auth },
    { label: 'reports-service/v1/report',      url: `https://api.adjust.com/reports-service/v1/report?${baseApp}`, auth },
    { label: 'reports/v1 app in path',         url: `https://api.adjust.com/reports/v1/${app}?${base}`, auth },
    { label: 'v2 kpis app in path',            url: `https://api.adjust.com/kpis/v2/${app}?${base}`, auth },
    { label: 'dashboard-api/reports',          url: `https://api.adjust.com/dashboard-api/reports?${baseApp}`, auth },
    { label: 'rs-api/report',                  url: `https://api.adjust.com/rs-api/report?${baseApp}`, auth },
    { label: 'accept json header',             url: `https://api.adjust.com/reports-service/report?${baseApp}`, auth, accept: 'application/json' },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const headers: Record<string, string> = { Authorization: c.auth };
      if ('accept' in c && c.accept) headers['Accept'] = c.accept as string;
      const res  = await fetch(c.url, { headers });
      const body = await res.text().catch(() => '');
      return { label: c.label, status: res.status, body: body.slice(0, 200) };
    } catch (e) {
      return { label: c.label, status: null, body: String(e).slice(0, 150) };
    }
  }));

  return NextResponse.json({ today, app_token: app, token_prefix: apiToken.slice(0, 6), results });
}
