import { NextResponse } from 'next/server';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const config = {
    ADJUST_API_TOKEN:  apiToken  ? `${apiToken.slice(0, 6)}…(${apiToken.length} chars)` : '❌ non défini',
    ADJUST_APP_TOKENS: appTokens.length > 0 ? appTokens.map((t) => `${t}`) : ['❌ non défini'],
  };

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ config, error: 'Variables manquantes' }, { status: 503 });
  }

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const app     = appTokens[0];

  const candidates = [
    // Variant A: app_token[] literal brackets, comma dimensions
    {
      label: 'A: app_token[]+dims comma',
      url: `https://api.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day,campaign&metrics=installs,cost&limit=5`,
      auth: `Token token=${apiToken}`,
    },
    // Variant B: filter_by approach
    {
      label: 'B: filter_by app_token',
      url: `https://api.adjust.com/reports-service/report?filter_by=app_token%3D${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day,campaign&metrics=installs,cost&limit=5`,
      auth: `Token token=${apiToken}`,
    },
    // Variant C: no app filter (test if endpoint exists)
    {
      label: 'C: no app filter (endpoint probe)',
      url: `https://api.adjust.com/reports-service/report?start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      auth: `Token token=${apiToken}`,
    },
    // Variant D: Bearer auth
    {
      label: 'D: Bearer auth',
      url: `https://api.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day,campaign&metrics=installs,cost&limit=5`,
      auth: `Bearer ${apiToken}`,
    },
    // Variant E: KPI v2 (if exists)
    {
      label: 'E: kpis/v2',
      url: `https://api.adjust.com/kpis/v2/${app}?start_date=${weekAgo}&end_date=${today}&kpis=installs,cost&grouping=day`,
      auth: `Token token=${apiToken}`,
    },
    // Variant F: no auth header (should give 401/403 if endpoint exists)
    {
      label: 'F: no auth (endpoint probe)',
      url: `https://api.adjust.com/reports-service/report?start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      auth: '',
    },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const headers: Record<string, string> = {};
      if (c.auth) headers['Authorization'] = c.auth;
      const res  = await fetch(c.url, { headers });
      const body = await res.text().catch(() => '');
      return { label: c.label, status: res.status, body: body.slice(0, 300) };
    } catch (e) {
      return { label: c.label, status: null, body: String(e).slice(0, 200) };
    }
  }));

  return NextResponse.json({ config, today, results }, { status: 200 });
}
