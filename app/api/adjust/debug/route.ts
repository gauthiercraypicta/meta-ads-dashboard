import { NextResponse } from 'next/server';

const REPORT_URL = 'https://dash.adjust.com/control-center/reports-service/report';

export async function GET() {
  const apiToken  = process.env.ADJUST_API_TOKEN  ?? '';
  const appTokens = (process.env.ADJUST_APP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!apiToken || appTokens.length === 0) {
    return NextResponse.json({ error: 'Variables manquantes' }, { status: 503 });
  }

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  const weekAgo   = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const period    = `${weekAgo}:${yesterday}`;

  const url = `${REPORT_URL}?${appTokens.map(t => `app_token[]=${t}`).join('&')}&date_period=${period}&dimensions=day,campaign&metrics=installs,clicks,impressions,cost&limit=5000`;

  const res  = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
  const body = await res.json() as {
    rows?: { day?: string; campaign?: string; installs?: number }[];
    totals?: Record<string, unknown>;
    warnings?: unknown[];
  };

  const rowSum = (body.rows ?? []).reduce((s, r) => s + Number(r.installs ?? 0), 0);

  return NextResponse.json({
    period:        `${weekAgo} → ${yesterday}`,
    apiTotals:     body.totals,               // what Adjust UI uses — should match UI number
    rowSum,                                   // sum of campaign rows — organic excluded
    gapExplanation: 'apiTotals.installs - rowSum = organic/unattributed installs',
    warnings:      body.warnings,
    sampleRows:    (body.rows ?? []).slice(0, 5),
  });
}
