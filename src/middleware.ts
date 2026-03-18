import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth for login page, API routes, static assets, and public portal
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/book') ||
    pathname.startsWith('/api/portal') ||
    pathname.startsWith('/api/book') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/stripe/webhook') ||
    pathname.startsWith('/api/twilio/webhook') ||
    pathname === '/api/quickbooks/callback' ||
    pathname.startsWith('/_next') ||
    /\.(ico|png|jpg|jpeg|svg|gif|webp|css|js|woff2?|ttf|eot|map|txt|xml|json|webmanifest)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('sb-access-token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.getUser(token);
    if (error) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
