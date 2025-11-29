import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import BookingDetailsClient from "../[id]/BookingDetailsClient";
import { downloadBookingIcs } from "@/lib/api";
import type { BookingFull } from "@/types";

jest.mock("@/components/booking/PaymentModal", () => ({
  __esModule: true,
  default: ({ open }: any) => (open ? <div data-testid="payment-modal">Pay Now</div> : null),
}));

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...rest }: any) =>
      React.createElement("a", { href: typeof href === "string" ? href : (href?.pathname || "#"), ...rest }, children),
  };
});

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "test@example.com" } }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  downloadBookingIcs: jest.fn(),
}));

const baseBooking = (): BookingFull => ({
  booking: {
    id: 1,
    service_provider_id: 2,
    client_id: 3,
    service_id: 4,
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    status: "confirmed",
    total_price: 100,
    notes: "",
    payment_status: "pending",
    booking_request_id: 7,
    invoice_id: null,
    visible_invoices: [],
    service_provider: { id: 2, user_id: 2, business_name: "Artist", slug: "artist-slug" } as any,
    service: { title: "Gig", artist: { business_name: "Artist", slug: "artist-slug" } } as any,
    client: { id: 3 } as any,
  } as any,
  invoice: null,
  payment: null,
});

describe("BookingDetailsClient", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders booking details and shows pay button when pending", async () => {
    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsClient initial={baseBooking()} payIntent={false} />);
    });

    expect(div.textContent).toContain("Gig - Artist");
    const pay = div.querySelector('[data-testid="pay-now-button"]');
    expect(pay).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("shows receipt link when payment_id is present", async () => {
    const fixture = baseBooking();
    fixture.payment = { payment_id: "pay_123", payment_status: "paid" };
    fixture.booking.payment_status = "paid";

    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsClient initial={fixture} payIntent={false} />);
    });

    const link = div.querySelector('[data-testid="booking-receipt-link"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/receipts/pay_123");

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("renders a link to message the artist", async () => {
    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsClient initial={baseBooking()} payIntent={false} />);
    });

    const msg = div.querySelector('[data-testid="message-artist-link"]');
    expect(msg).not.toBeNull();
    expect(msg?.getAttribute("href")).toBe("/booking-requests/7");

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("opens the payment modal when payIntent is set and payment is pending", async () => {
    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsClient initial={baseBooking()} payIntent />);
    });

    const modal = div.querySelector('[data-testid="payment-modal"]');
    expect(modal).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
