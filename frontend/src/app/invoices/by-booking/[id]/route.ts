import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function apiBase(): string {
  const env = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (env) return env.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? 'https://api.booka.co.za' : 'http://localhost:8000';
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const bookingId = params.id;
  if (!bookingId || !/^\d+$/.test(bookingId)) {
    return new NextResponse('Invalid booking id', { status: 400 });
  }

  const cookie = req.headers.get('cookie') || '';
  const type = req.nextUrl.searchParams.get('type') || 'provider';
  const url = `${apiBase()}/api/v1/invoices/by-booking/${encodeURIComponent(bookingId)}?type=${encodeURIComponent(type)}`;

  const resp = await fetch(url, { method: 'GET', headers: { cookie } });
  if (resp.status === 401 || resp.status === 403) {
    const returnTo = `/invoices/by-booking/${encodeURIComponent(bookingId)}?type=${encodeURIComponent(type)}`;
    const loginUrl = `/login?next=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(loginUrl);
  }
  if (!resp.ok) {
    return new NextResponse('Invoice not found', { status: resp.status });
  }
  const data = await resp.json();
  const id = data?.id;
  if (!id) {
    return new NextResponse('Invoice not available', { status: 404 });
  }
  return NextResponse.redirect(`/invoices/${encodeURIComponent(String(id))}`);
}
