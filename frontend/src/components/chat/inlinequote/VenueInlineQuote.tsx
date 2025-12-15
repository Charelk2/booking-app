import React, { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import type { QuoteV2Create, ServiceItem } from "@/types";
import { formatCurrency, generateQuoteNumber } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { buildLiveQuotePayload } from "@/lib/shared/quotes/builders";

export interface VenueInlineQuoteProps {
  onSubmit: (data: QuoteV2Create) => Promise<void> | void;
  artistId: number;
  clientId: number;
  bookingRequestId: number;
  serviceName?: string;
  initialBaseFee?: number;
  initialItems?: ServiceItem[];
}

const expiryOptions = [
  { label: "No expiry", value: "" },
  { label: "1 day", value: 24 },
  { label: "3 days", value: 72 },
  { label: "7 days", value: 168 },
] as const;

const toNumber = (v: string | number) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

function stageLabel(t: string): string {
  const v = String(t || "").toLowerCase();
  if (v === "cleaning_fee") return "Cleaning fee";
  if (v === "overtime") return "Overtime";
  return t || "Line item";
}

export default function VenueInlineQuote({
  onSubmit,
  artistId,
  clientId,
  bookingRequestId,
  serviceName,
  initialBaseFee,
  initialItems,
}: VenueInlineQuoteProps) {
  const [serviceFee, setServiceFee] = useState<number>(initialBaseFee ?? 0);
  const [items, setItems] = useState<(ServiceItem & { key: string })[]>(() => {
    const seed = Array.isArray(initialItems) ? initialItems : [];
    return seed.map((it, idx) => ({
      description: it.description,
      price: Number(it.price || 0),
      key: `seed:${idx}`,
    }));
  });
  const [discount, setDiscount] = useState<number>(0);
  const [expiresHours, setExpiresHours] = useState<number | "">("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quoteNumber] = useState<string>(generateQuoteNumber());
  const todayLabel = format(new Date(), "PPP");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(() => {
    const itemsTotal = items.reduce((sum, it) => sum + Number(it.price || 0), 0);
    return Math.max(0, Number(serviceFee || 0) + itemsTotal);
  }, [serviceFee, items]);

  const total = useMemo(() => {
    const afterDiscount = subtotal - Number(discount || 0);
    return Math.max(0, afterDiscount);
  }, [subtotal, discount]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        key: `item:${Date.now()}:${Math.floor(Math.random() * 1e6)}`,
        description: "",
        price: 0,
      },
    ]);
  };

  const updateItem = (key: string, patch: Partial<ServiceItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!Number.isFinite(serviceFee) || serviceFee <= 0) {
      setError("Please enter a venue rental amount.");
      return;
    }

    setSending(true);
    try {
      const payload = buildLiveQuotePayload({
        bookingRequestId,
        artistId,
        clientId,
        serviceName: serviceName || "Venue rental",
        serviceFee,
        items,
        soundFee: 0,
        travelFee: 0,
        discount,
        expiresHours,
        accommodation: null,
        isSupplierParent: false,
      });
      await onSubmit(payload);
    } catch (e: any) {
      setError(e?.message || "Failed to submit quote.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-gray-500">
              Quote #{quoteNumber}
            </div>
            <div className="mt-1 text-sm font-medium text-gray-900">
              {serviceName || "Venue rental"}
            </div>
            <div className="mt-1 text-xs text-gray-500">Created {todayLabel}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Venue rental (per day)
            </label>
            <input
              ref={firstFieldRef}
              inputMode="decimal"
              className="mt-1 w-full rounded-md border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30"
              value={formatCurrency(Number.isFinite(serviceFee) ? serviceFee : 0)}
              onChange={(e) => setServiceFee(toNumber(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Discount (optional)
            </label>
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-md border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30"
              value={formatCurrency(Number.isFinite(discount) ? discount : 0)}
              onChange={(e) => setDiscount(toNumber(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Line items</div>
            <button
              type="button"
              onClick={addItem}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Add
            </button>
          </div>
          {items.length === 0 ? (
            <div className="mt-2 text-sm text-gray-600">
              Add optional fees like cleaning, overtime, staffing, etc.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {items.map((it) => (
                <div key={it.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <input
                    type="text"
                    className="w-full rounded-md border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30"
                    placeholder={stageLabel(it.description)}
                    value={it.description}
                    onChange={(e) => updateItem(it.key, { description: e.target.value })}
                  />
                  <input
                    inputMode="decimal"
                    className="w-full sm:w-32 rounded-md border border-gray-200 bg-white/60 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30"
                    value={formatCurrency(Number.isFinite(it.price) ? it.price : 0)}
                    onChange={(e) => updateItem(it.key, { price: toNumber(e.target.value) })}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Quote expiry
            </label>
            <select
              className="mt-1 w-full rounded-md border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30"
              value={expiresHours as any}
              onChange={(e) => {
                const v = e.target.value;
                setExpiresHours(v === "" ? "" : Number(v));
              }}
            >
              {expiryOptions.map((o) => (
                <option key={o.label} value={o.value as any}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Subtotal</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-gray-700">Total (quote)</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Client total may include platform fees.
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end">
          <Button onClick={handleSubmit} isLoading={sending}>
            Send quote
          </Button>
        </div>
      </div>
    </div>
  );
}
