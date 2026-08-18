import { NextResponse } from 'next/server';

const BASE    = 'https://graph.facebook.com/v21.0';
const TOKEN   = process.env.META_ACCESS_TOKEN  ?? '';
const ACCOUNT = process.env.META_AD_ACCOUNT_ID ?? '';

export async function GET(req: Request) {
  if (!TOKEN || !ACCOUNT) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID manquants' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since') ?? new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];

  // Try the /activities endpoint — returns ad account change history
  const params = new URLSearchParams({
    fields:       'event_type,event_time,object_id,object_name,object_type,extra_data,translated_event_name',
    since:        String(Math.floor(new Date(since).getTime() / 1000)),
    limit:        '200',
    access_token: TOKEN,
  });

  const url = `${BASE}/${ACCOUNT}/activities?${params}`;
  console.log('[meta-budget-debug] fetching:', url.replace(TOKEN, 'TOKEN'));

  try {
    const res  = await fetch(url);
    const json = await res.json() as { data?: unknown[]; error?: { message: string } };

    if (json.error) {
      return NextResponse.json({ error: json.error.message, url: url.replace(TOKEN, 'TOKEN') }, { status: 400 });
    }

    const rows = (json.data ?? []) as Array<Record<string, unknown>>;

    // Summarise unique event_types so we know what exists
    const byType = new Map<string, number>();
    for (const r of rows) {
      const t = String(r.event_type ?? 'unknown');
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }

    // Budget-looking events (anything with "budget" in type or extra_data)
    const budgetRows = rows.filter((r) => {
      const t  = String(r.event_type ?? '').toLowerCase();
      const ex = JSON.stringify(r.extra_data ?? '').toLowerCase();
      return t.includes('budget') || ex.includes('budget') || ex.includes('daily_budget');
    });

    return NextResponse.json({
      totalRows:   rows.length,
      eventTypes:  Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])),
      budgetRows:  budgetRows.slice(0, 20),
      sampleRow:   rows[0] ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
