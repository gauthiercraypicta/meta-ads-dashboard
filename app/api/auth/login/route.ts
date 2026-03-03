import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const correctPassword = process.env.AUTH_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  if (password !== correctPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set('auth_session', 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}
