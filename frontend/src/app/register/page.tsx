import { redirect } from 'next/navigation';

type Search = { next?: string; email?: string; role?: string; user_type?: string };

export default function Page({ searchParams }: { searchParams?: Search }) {
  const next = searchParams?.next ? `&next=${encodeURIComponent(searchParams.next)}` : '';
  const email = searchParams?.email ? `&email=${encodeURIComponent(searchParams.email)}` : '';
  const roleVal = (searchParams?.role || searchParams?.user_type || '').toLowerCase();
  const role = roleVal === 'service_provider' ? '&role=service_provider' : '';
  redirect(`/auth?intent=signup${role}${next}${email}`);
}

