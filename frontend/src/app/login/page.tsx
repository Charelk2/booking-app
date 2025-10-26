import { redirect } from 'next/navigation';

export default function Page({ searchParams }: { searchParams?: { next?: string } }) {
  const next = searchParams?.next ? `&next=${encodeURIComponent(searchParams.next)}` : '';
  redirect(`/auth?intent=login${next}`);
}

