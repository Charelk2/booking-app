"use client";
import React, { useMemo, useState } from "react";
import { BookingRequest } from "@/types";
import { BookingRequestCard } from "@/components/dashboard";
import Section from "@/components/ui/Section";
import TextInput from "@/components/ui/TextInput";
import IllustratedEmpty from "@/components/ui/IllustratedEmpty";

type Props = {
  requests: BookingRequest[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  title?: string;
  subtitle?: string;
  hideHeader?: boolean;
  headerAction?: React.ReactNode;
};

import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import ErrorState from "@/components/ui/ErrorState";

const RequestsSection: React.FC<Props> = ({
  requests,
  loading,
  error,
  onRetry,
  title,
  subtitle,
  hideHeader = false,
  headerAction,
}) => {
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(5);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return requests.filter((r) => {
      const name = r.client ? `${r.client.first_name} ${r.client.last_name}`.toLowerCase() : "";
      const matchesSearch = name.includes(lower);
      const matchesStatus = !status || r.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, status]);

  const visibleList = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
    return sorted.slice(0, visible);
  }, [filtered, sort, visible]);

  const hasMore = filtered.length > visible;

  const sectionTitle = hideHeader ? undefined : (title ?? "Requests");
  const sectionSubtitle = hideHeader ? undefined : (subtitle ?? "Latest inquiries from clients");

  if (loading) return <Section title={sectionTitle} subtitle={sectionSubtitle} action={headerAction} className="mb-10"><LoadingSkeleton lines={6} /></Section>;

  if (error) return <Section title={sectionTitle} subtitle={sectionSubtitle} action={headerAction} className="mb-10"><ErrorState message={error} onRetry={onRetry} /></Section>;

  return (
    <Section title={sectionTitle} subtitle={sectionSubtitle} action={headerAction} className="mb-10">
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <TextInput
          aria-label="Search by client name"
          placeholder="Search by client name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Sort requests"
          data-testid="request-sort"
          className="h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]"
          value={sort}
          onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
        <select
          aria-label="Filter requests"
          data-testid="request-status"
          className="h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="pending_quote">Pending Quote</option>
          <option value="quote_provided">Quote Provided</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      {visibleList.length === 0 ? (
        <IllustratedEmpty
          variant="requests"
          title="No booking requests yet"
          description="When clients reach out, their requests will appear here for you to review and respond."
        />
      ) : (
        <ul className="space-y-4">
          {visibleList.map((req) => (
            <li key={req.id}>
              <BookingRequestCard req={req} />
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setVisible((c) => c + 5)}
            className="text-brand-primary hover:underline text-sm font-medium"
          >
            Load More
          </button>
        </div>
      )}
    </Section>
  );
};

export default RequestsSection;
