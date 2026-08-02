import { NextResponse } from 'next/server';

const DIMENSIONS = 'day,campaign,os_name';
const METRICS    = 'installs,clicks,impressions,cost';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const config = {
    ADJUST_API_TOKEN:  apiToken  ? `${apiToken.slice(0, 6)}…(${apiToken.length} chars)` : '❌ non défini',
    ADJUST_APP_TOKENS: appTokens.length > 0 ? appTokens.map((t) => `${t.slice(0, 4)}…(${t.length} chars)`) : ['❌ non défini'],
  };

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ config, error: 'Variables manquantes' }, { status: 503 });
  }

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const baseParams = `start_date=${weekAgo}&end_date=${today}&dimensions=${DIMENSIONS}&metrics=${METRICS}&limit=5`;

  // Test several URL variants + auth formats to find what works
  const candidates = [
    { label: 'report-service Token',  url: `https://api.adjust.com/reports-service/report?${baseParams}`,      auth: `Token token=${apiToken}` },
    { label: 'report-service Bearer', url: `https://api.adjust.com/reports-service/report?${baseParams}`,      auth: `Bearer ${apiToken}` },
    { label: 'report-service + app Token', url: `https://api.adjust.com/reports-service/report?${appTokens.map(t=>`app_token[]=${t}`).join('&')}&${baseParams}`, auth: `Token token=${apiToken}` },
    { label: 'v2 report Token',        url: `https://api.adjust.com/v2/reports?${baseParams}`,                 auth: `Token token=${apiToken}` },
    { label: 'kpis v2 Token',          url: `https://api.adjust.com/kpis/v2/${appTokens[0]}?start_date=${weekAgo}&end_date=${today}&kpis=installs,cost&grouping=day`, auth: `Token token=${apiToken}` },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const res = await fetch(c.url, { headers: { Authorization: c.auth } });
      const body = await res.text().catch(() => '');
      return { label: c.label, status: res.status, body: body.slice(0, 200) };
    } catch (e) {
      return { label: c.label, status: null, body: String(e).slice(0, 200) };
    }
  }));

  return NextResponse.json({ config, today, results });
}
