import { NextResponse } from 'next/server';

const REPORT_URL = 'https://api.adjust.com/reports-service/report';
const DIMENSIONS = ['day', 'campaign', 'os_name'];
const METRICS    = ['installs', 'clicks', 'impressions', 'cost'];

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const config = {
    ADJUST_API_TOKEN:  apiToken  ? `${apiToken.slice(0, 4)}…(${apiToken.length} chars)` : '❌ non défini',
    ADJUST_APP_TOKENS: appTokens.length > 0 ? appTokens.map((t) => `${t.slice(0, 4)}…(${t.length} chars)`) : ['❌ non défini'],
  };

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ config, error: 'Variables manquantes' }, { status: 503 });
  }

  // Build the URL exactly as fetchReport does
  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const parts: string[] = [];
  for (const t of appTokens)  parts.push(`app_token[]=${encodeURIComponent(t)}`);
  parts.push(`start_date=${weekAgo}`, `end_date=${today}`);
  parts.push(`dimensions=${DIMENSIONS.join(',')}`);
  parts.push(`metrics=${METRICS.join(',')}`);
  parts.push('limit=10');
  const url = `${REPORT_URL}?${parts.join('&')}`;

  // Real call to Adjust
  let adjustStatus: number | null = null;
  let adjustBody   = '';
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Token token=${apiToken}` },
    });
    adjustStatus = res.status;
    adjustBody   = await res.text().catch(() => '');
  } catch (e) {
    adjustBody = String(e);
  }

  return NextResponse.json({
    config,
    url,
    adjust_http_status: adjustStatus,
    adjust_response:    adjustBody.slice(0, 600),
  });
}
