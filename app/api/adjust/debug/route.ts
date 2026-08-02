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
  const auth    = `Token token=${apiToken}`;
  const jsonHdr = { Authorization: auth, Accept: 'application/json' };

  // The Accept:application/json variant gave "Server internal error" instead of "Page not found"
  // → the JSON handler exists. Let's find which parameters make it work.
  const candidates = [
    // Minimal params
    {
      label: 'json: day + installs (minimal)',
      url: `https://api.adjust.com/reports-service/report?start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      headers: jsonHdr,
    },
    // With app token
    {
      label: 'json: + app_token[]',
      url: `https://api.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      headers: jsonHdr,
    },
    // With currency
    {
      label: 'json: + currency=USD',
      url: `https://api.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&currency=USD&limit=5`,
      headers: jsonHdr,
    },
    // More dimensions
    {
      label: 'json: day,campaign + installs,cost',
      url: `https://api.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day,campaign&metrics=installs,cost&limit=5`,
      headers: jsonHdr,
    },
    // Attribution type param
    {
      label: 'json: + attribution_type=click',
      url: `https://api.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&attribution_type=click&limit=5`,
      headers: jsonHdr,
    },
    // Try cohorts endpoint
    {
      label: 'json: cohorts endpoint',
      url: `https://api.adjust.com/reports-service/cohorts?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      headers: jsonHdr,
    },
    // Alternative subdomains
    {
      label: 'reporting.adjust.com',
      url: `https://reporting.adjust.com/reports-service/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      headers: jsonHdr,
    },
    {
      label: 'rs-api.adjust.com',
      url: `https://rs-api.adjust.com/report?app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`,
      headers: jsonHdr,
    },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const res  = await fetch(c.url, { headers: c.headers });
      const body = await res.text().catch(() => '');
      return { label: c.label, status: res.status, body: body.slice(0, 300) };
    } catch (e) {
      return { label: c.label, status: null, body: String(e).slice(0, 200) };
    }
  }));

  return NextResponse.json({ today, app, results });
}
