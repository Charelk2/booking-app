import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function apiBase(): string {
  const env = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (env) return env.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? 'https://api.booka.co.za' : 'http://localhost:8000';
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id || !/^\d+$/.test(id)) {
    return new NextResponse('Invalid invoice id', { status: 400 });
  }

  const cookie = req.headers.get('cookie') || '';
  const url = `${apiBase()}/api/v1/invoices/${encodeURIComponent(id)}/pdf`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: { cookie },
  });

  if (resp.status === 401 || resp.status === 403) {
    const returnTo = `/invoices/${encodeURIComponent(id)}`;
    const loginUrl = `/login?next=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (!resp.ok) {
    // Fallback: try resolving via booking id if provided and server returned 404
    if (resp.status === 404) {
      try {
        const bookingId = req.nextUrl.searchParams.get('booking_id');
        if (bookingId && /^\d+$/.test(bookingId)) {
          const type = 'provider';
          const altUrl = `${apiBase()}/api/v1/invoices/by-booking/${encodeURIComponent(bookingId)}?type=${encodeURIComponent(type)}`;
          const alt = await fetch(altUrl, { method: 'GET', headers: { cookie } });
          if (alt.ok) {
            const data = await alt.json();
            const newId = data?.id;
            if (newId) {
              return NextResponse.redirect(`/invoices/${encodeURIComponent(String(newId))}`);
            }
          }
        }
      } catch {}
    }
    return new NextResponse('Invoice unavailable', { status: resp.status });
  }

  // Stream PDF back to the browser
  const headers = new Headers();
  headers.set('Content-Type', 'application/pdf');
  const filename = `invoice_${id}.pdf`;
  headers.set('Content-Disposition', `inline; filename="${filename}"`);
  const robots = resp.headers.get('X-Robots-Tag');
  if (robots) headers.set('X-Robots-Tag', robots);

  return new NextResponse(resp.body, { status: 200, headers });
}
