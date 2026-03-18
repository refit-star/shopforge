import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { access_token, refresh_token } = await req.json();

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = 60 * 60 * 24 * 7; // 7 days

  const res = NextResponse.json({ ok: true });

  res.cookies.set('sb-access-token', access_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  res.cookies.set('sb-refresh-token', refresh_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });

  res.cookies.set('sb-access-token', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });

  res.cookies.set('sb-refresh-token', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });

  return res;
}
