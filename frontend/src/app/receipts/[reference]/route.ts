import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

  const resp = await fetch(url, {
    method: 'GET',
    headers: { cookie },
  });

  if (resp.status === 401 || resp.status === 403) {
    const returnTo = `/receipts/${encodeURIComponent(reference)}`;
    const loginUrl = `/login?next=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(loginUrl);
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

  return new NextResponse(resp.body, { status: 200, headers });
}

