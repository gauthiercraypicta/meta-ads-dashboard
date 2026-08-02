import { NextResponse } from 'next/server';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const config = {
    ADJUST_API_TOKEN:  apiToken  ? `${apiToken.slice(0, 6)}…(${apiToken.length} chars)` : '❌ non défini',
    ADJUST_APP_TOKENS: appTokens.length > 0 ? appTokens : ['❌ non défini'],
  };

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ config, error: 'Variables manquantes' }, { status: 503 });
  }

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const app     = appTokens[0];

  const candidates = [
    // Canary: KPI v1 (doit retourner 410 si le token est valide et l'API accessible)
    {
      label: 'CANARY kpis/v1 (doit être 410)',
      url: `https://api.adjust.com/kpis/v1/${app}?start_date=${weekAgo}&end_date=${today}&kpis=installs&grouping=day`,
      auth: `Token token=${apiToken}`,
    },
    // Report Service sans app filter (test endpoint)
    {
      label: 'RS sans app filter',
      url: `https://api.adjust.com/reports-service/report?start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      auth: `Token token=${apiToken}`,
    },
    // Report Service sans auth (si 401/403 → endpoint existe)
    {
      label: 'RS sans auth (doit être 401/403 si endpoint existe)',
      url: `https://api.adjust.com/reports-service/report?start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      auth: '',
    },
    // Autre domaine possible
    {
      label: 'suite.adjust.com RS',
      url: `https://suite.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      auth: `Token token=${apiToken}`,
    },
    // app.adjust.com
    {
      label: 'app.adjust.com RS',
      url: `https://app.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      auth: `Token token=${apiToken}`,
    },
    // Test connectivité basique
    {
      label: 'ping api.adjust.com racine',
      url: `https://api.adjust.com/`,
      auth: '',
    },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const headers: Record<string, string> = {};
      if (c.auth) headers['Authorization'] = c.auth;
      const res  = await fetch(c.url, { headers });
      const body = await res.text().catch(() => '');
      return { label: c.label, status: res.status, body: body.slice(0, 400) };
    } catch (e) {
      return { label: c.label, status: null, body: String(e).slice(0, 300) };
    }
  }));

  return NextResponse.json({ config, today, results }, { status: 200 });
}
