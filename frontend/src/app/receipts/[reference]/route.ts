import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Serve this proxy from the Edge runtime so redirect decisions happen close
// to users and we avoid server cold starts where possible.
export const runtime = 'edge';

function apiBase(): string {
  const env = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (env) return env.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? 'https://api.booka.co.za' : 'http://localhost:8000';
}

export async function GET(req: NextRequest, { params }: { params: { reference: string } }) {
  const reference = params.reference;
  if (!reference || reference.length < 4) {
    return new NextResponse('Invalid reference', { status: 400 });
  }

  // Forward cookies so backend can authenticate the client (COOKIE_DOMAIN should be .booka.co.za)
  const cookie = req.headers.get('cookie') || '';
  const url = `${apiBase()}/api/v1/payments/${encodeURIComponent(reference)}/receipt`;

  // Ask backend for the receipt. If it responds with a redirect to a signed
  // CDN/R2 URL, forward that redirect to the browser so it downloads directly
  // from the edge. Otherwise, stream the PDF as a fallback.
  const resp = await fetch(url, {
    method: 'GET',
    headers: { cookie },
    redirect: 'manual',
  });

  if (resp.status === 401 || resp.status === 403) {
    const returnTo = `/receipts/${encodeURIComponent(reference)}`;
    const loginUrl = `/login?next=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Forward presigned redirect if present (tokenized, cacheable at CDN)
  if (resp.status === 302 || resp.status === 303 || resp.status === 307 || resp.status === 308) {
    const loc = resp.headers.get('location');
    if (loc) return NextResponse.redirect(loc);
  }

  if (!resp.ok) {
    return new NextResponse('Receipt unavailable', { status: resp.status });
  }

  // Stream PDF back to the browser
  const headers = new Headers();
  headers.set('Content-Type', 'application/pdf');
  const filename = `${reference}.pdf`;
  headers.set('Content-Disposition', `inline; filename="${filename}"`);
  const robots = resp.headers.get('X-Robots-Tag');
  if (robots) headers.set('X-Robots-Tag', robots);

  // Fallback: stream PDF via the proxy; mark as non-cacheable since this path
  // is per-user/cookie gated.
  headers.set('Cache-Control', 'no-store, private');
  // Hint support for range requests when proxied (some clients check header only)
  headers.set('Accept-Ranges', 'bytes');
  return new NextResponse(resp.body, { status: 200, headers });
}
