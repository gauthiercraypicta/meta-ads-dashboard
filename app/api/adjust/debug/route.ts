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

  // Fetch a small report with event_kpis to see the exact key format in rows
  const url = `${DASH_RS}/report?app_token[]=${app}&date_period=${weekAgo}:${today}&dimensions=day&metrics=installs,cost&event_kpis[]=citg8a&limit=3`;

  try {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
    const body = await res.text().catch(() => '');

    let parsed: unknown = null;
    try { parsed = JSON.parse(body); } catch { /* ignore */ }

    // Extract first row to show exact keys
    let sampleRow: unknown = null;
    let rowKeys: string[] = [];
    if (parsed && typeof parsed === 'object' && 'rows' in parsed) {
      const rows = (parsed as { rows: unknown[] }).rows;
      if (rows.length > 0) {
        sampleRow = rows[0];
        rowKeys = Object.keys(rows[0] as object);
      }
    }

    return NextResponse.json({
      status: res.status,
      url,
      sampleRow,
      rowKeys,
      rawBody: body.slice(0, 1000),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
