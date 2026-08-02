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
  const baseQ   = `app_token[]=${app}&start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`;
  const RS      = 'https://api.adjust.com/reports-service/report';
  const json    = 'application/json';

  type Candidate = { label: string; url: string; headers: Record<string, string>; method?: string; body?: string };
  const candidates: Candidate[] = [
    { label: 'Bearer + Accept:json',         url: `${RS}?${baseQ}`,                              headers: { Authorization: `Bearer ${apiToken}`, Accept: json } },
    { label: 'token= query param',           url: `${RS}?token=${apiToken}&${baseQ}`,             headers: { Accept: json } },
    { label: 'user_token= query param',      url: `${RS}?user_token=${apiToken}&${baseQ}`,        headers: { Accept: json } },
    { label: 'app in path Token',            url: `https://api.adjust.com/reports-service/report/${app}?start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`, headers: { Authorization: `Token token=${apiToken}`, Accept: json } },
    { label: 'Bearer no app filter',         url: `${RS}?start_date=${weekAgo}&end_date=${today}&dimensions=day&metrics=installs&limit=5`, headers: { Authorization: `Bearer ${apiToken}`, Accept: json } },
    { label: 'POST Token+json body',         url: RS,                                             headers: { Authorization: `Token token=${apiToken}`, Accept: json, 'Content-Type': json }, method: 'POST', body: JSON.stringify({ app_token: [app], start_date: weekAgo, end_date: today, dimensions: ['day'], metrics: ['installs'], limit: 5 }) },
    { label: 'CANARY kpis/v1 + Accept:json', url: `https://api.adjust.com/kpis/v1/${app}?start_date=${weekAgo}&end_date=${today}&kpis=installs&grouping=day`, headers: { Authorization: `Token token=${apiToken}`, Accept: json } },
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const opts: RequestInit = { headers: c.headers };
      if ('method' in c) { opts.method = c.method as string; opts.body = c.body as string; }
      const res  = await fetch(c.url, opts);
      const body = await res.text().catch(() => '');
      return { label: c.label, status: res.status, body: body.slice(0, 400) };
    } catch (e) {
      return { label: c.label, status: null, body: String(e).slice(0, 200) };
    }
  }));

  return NextResponse.json({ today, app, results });
}
