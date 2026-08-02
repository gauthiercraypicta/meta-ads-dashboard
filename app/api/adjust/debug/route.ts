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
  const base    = `app_token[]=${app}&date_period=${weekAgo}:${today}&dimensions=day&metrics=installs,cost&limit=3`;

  const candidates = [
    { label: 'event_kpis[]=citg8a',        url: `${DASH_RS}/report?${base}&event_kpis[]=citg8a` },
    { label: 'event_kpis[]=citg8a.events', url: `${DASH_RS}/report?${base}&event_kpis[]=citg8a.events` },
    { label: 'filters_data event_metrics',  url: `${DASH_RS}/filters_data?required_filters=event_metrics&app_token[]=${app}` },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const res  = await fetch(c.url, { headers: { Authorization: `Bearer ${apiToken}` } });
      const body = await res.text().catch(() => '');
      let parsed: unknown = null;
      try { parsed = JSON.parse(body); } catch { /* ignore */ }
      const rows = parsed && typeof parsed === 'object' && 'rows' in parsed
        ? (parsed as { rows: unknown[] }).rows : [];
      return {
        label:     c.label,
        status:    res.status,
        rowKeys:   rows.length > 0 ? Object.keys(rows[0] as object) : [],
        sampleRow: rows[0] ?? null,
        rawBody:   body.slice(0, 600),
      };
    } catch (e) {
      return { label: c.label, status: null, rowKeys: [], sampleRow: null, rawBody: String(e) };
    }
  }));

  return NextResponse.json({ today, app, results });
}
