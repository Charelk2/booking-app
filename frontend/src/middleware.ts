import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_FILE = /\.(?:.*)$/;

function isEnabled(v: string | undefined | null): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

const comingSoonEnabled = isEnabled(process.env.COMING_SOON);
const comingSoonHosts = (process.env.COMING_SOON_HOSTS || 'booka.co.za,www.booka.co.za')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function middleware(request: NextRequest) {
  if (!comingSoonEnabled) return NextResponse.next();

  const host = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    request.nextUrl.host ||
    ''
  )
    .trim()
    .toLowerCase();

  if (!host || !comingSoonHosts.includes(host)) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/coming-soon') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/coming-soon';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next).*)'],
};

