import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import BookingDetailsClient from "./BookingDetailsClient";
import type { BookingFull } from "@/types";

export const revalidate = 30;

type PageParams = {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
};

const API_BASE =
  (process.env.SERVER_API_ORIGIN || "").replace(/\/+$/, "") ||
  (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "") ||
  "https://api.booka.co.za";
const buildApiUrl = (path: string) =>
  /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

async function fetchBookingFull(id: number): Promise<BookingFull | null> {
  const cookieHeader = cookies().toString();
  const res = await fetch(buildApiUrl(`/api/v1/bookings/${id}/full`), {
    headers: {
      accept: "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    credentials: "include",
    next: { revalidate },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load booking (${res.status})`);
  }
  return res.json() as Promise<BookingFull>;
}

export default async function BookingDetailsPage({ params, searchParams }: PageParams) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    notFound();
  }

  const data = await fetchBookingFull(id);
  if (!data) {
    notFound();
  }

  const payIntent = (searchParams?.pay ?? "") === "1";

  return <BookingDetailsClient initial={data} payIntent={payIntent} />;
}
