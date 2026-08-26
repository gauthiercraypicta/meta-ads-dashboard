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

  // Fetch with all dimensions to see every campaign + all fields
  const url = `${DASH_RS}/report?app_token[]=${app}&date_period=${weekAgo}:${today}&dimensions=day,app_token,campaign,campaign_id_network,os_name&metrics=installs,cost,install_engagement_events&limit=5000`;

  try {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
    const body = await res.text();
    const parsed = JSON.parse(body) as { rows?: Record<string, unknown>[] };
    const rows = parsed.rows ?? [];

    // Unique campaigns with their fields
    const campMap = new Map<string, { campaign: unknown; campaign_id_network: unknown; app_token: unknown; cost: number; installs: number }>();
    for (const r of rows) {
      const key = String(r.campaign_id_network ?? r.campaign ?? '(empty)');
      const e = campMap.get(key) ?? { campaign: r.campaign, campaign_id_network: r.campaign_id_network, app_token: r.app_token, cost: 0, installs: 0 };
      e.cost     += Number(r.cost ?? 0);
      e.installs += Number(r.installs ?? 0);
      campMap.set(key, e);
    }

    const campaigns = Array.from(campMap.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.cost - a.cost);

    // First row keys to see what fields Adjust returns
    const sampleRowKeys = rows.length > 0 ? Object.keys(rows[0]) : [];

    return NextResponse.json({
      status: res.status,
      totalRows: rows.length,
      sampleRowKeys,
      sampleRow: rows[0] ?? null,
      campaigns,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
