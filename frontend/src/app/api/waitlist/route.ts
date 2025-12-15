import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

function truthy(v: string | undefined | null): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  if (email.length < 3 || email.length > 254) return false;
  if (email.includes(' ')) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at >= email.length - 1) return false;
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return false;
  return true;
}

function okHtmlRedirect(requestUrl: string, params: Record<string, string>): NextResponse {
  const url = new URL('/coming-soon', requestUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

function getMailjetConfig() {
  const listId = (process.env.MAILJET_WAITLIST_LIST_ID || '').trim();
  const apiKey = (process.env.MAILJET_API_KEY || process.env.MJ_APIKEY_PUBLIC || '').trim();
  const apiSecret = (process.env.MAILJET_API_SECRET || process.env.MJ_APIKEY_PRIVATE || '').trim();
  return { listId, apiKey, apiSecret };
}

async function readBody(request: NextRequest): Promise<{ email: string; company: string }> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const json = (await request.json().catch(() => ({}))) as any;
    return {
      email: String(json?.email || ''),
      company: String(json?.company || ''),
    };
  }
  const text = await request.text();
  const params = new URLSearchParams(text);
  return { email: params.get('email') || '', company: params.get('company') || '' };
}

export async function POST(request: NextRequest) {
  const accept = request.headers.get('accept') || '';
  const wantsHtml = accept.includes('text/html');

  const { email: rawEmail, company } = await readBody(request);
  const email = rawEmail.trim();

  if (company.trim()) {
    return wantsHtml ? okHtmlRedirect(request.url, { subscribed: '1' }) : NextResponse.json({ ok: true });
  }

  if (!isValidEmail(email)) {
    return wantsHtml
      ? okHtmlRedirect(request.url, { error: '1' })
      : NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }

  const { listId, apiKey, apiSecret } = getMailjetConfig();
  if (!listId || !apiKey || !apiSecret) {
    return wantsHtml
      ? okHtmlRedirect(request.url, { error: '1' })
      : NextResponse.json({ ok: false, error: 'server_not_configured' }, { status: 500 });
  }

  const disable = truthy(process.env.MAILJET_WAITLIST_DISABLE);
  if (disable) {
    return wantsHtml ? okHtmlRedirect(request.url, { subscribed: '1' }) : NextResponse.json({ ok: true });
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const res = await fetch(`https://api.mailjet.com/v3/REST/contactslist/${listId}/managecontact`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Email: email, Action: 'addforce' }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return wantsHtml
      ? okHtmlRedirect(request.url, { error: '1' })
      : NextResponse.json({ ok: false, error: 'upstream_failed' }, { status: 502 });
  }

  return wantsHtml ? okHtmlRedirect(request.url, { subscribed: '1' }) : NextResponse.json({ ok: true });
}
