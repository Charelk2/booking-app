import { flushPromises } from "@/test/utils/flush";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { format } from "date-fns";
import BookingDetailsPage from "../[id]/page";
import { getBookingDetails, downloadBookingIcs } from "@/lib/api";
 
import { useParams, useSearchParams } from "next/navigation";

jest.mock("@/lib/api");
jest.mock("next/navigation", () => ({
  useParams: jest.fn(),
  useSearchParams: jest.fn(),
  usePathname: jest.fn(() => "/dashboard/client/bookings/1"),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  })),
}));
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("a", props),
  };
});
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */


describe("BookingDetailsPage", () => {
  beforeEach(() => {
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders booking details and shows pay button when pending", async () => {
    (useParams as jest.Mock).mockReturnValue({ id: "1" });
    (getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 1,
        artist_id: 2,
        client_id: 3,
        service_id: 4,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        status: "confirmed",
        total_price: 100,
        notes: "",
        
        payment_status: "pending",
        service: { title: "Gig", artist: { business_name: "Artist" } },
        client: { id: 3 },
      },
    });
    (downloadBookingIcs as jest.Mock).mockResolvedValue({ data: new Blob() });

    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsPage />);
    });
    await flushPromises();

    expect(getBookingDetails).toHaveBeenCalledWith(1);
    expect(div.textContent).toContain("Gig - Artist");
    // Deposit banner removed; pending shows generic payment state
    const artistLink = div.querySelector('[data-testid="view-artist-link"]');
    expect(artistLink?.getAttribute("href")).toBe("/service-providers/2");
    const pay = div.querySelector('[data-testid="pay-now-button"]');
    expect(pay).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("shows receipt link when payment_id is present", async () => {
    (useParams as jest.Mock).mockReturnValue({ id: "2" });
    (getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 2,
        artist_id: 2,
        client_id: 3,
        service_id: 4,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        status: "confirmed",
        total_price: 100,
        notes: "",
        payment_status: "paid",
        payment_id: "pay_123",
        service: { title: "Gig", artist: { business_name: "Artist" } },
        client: { id: 3 },
      },
    });
    (downloadBookingIcs as jest.Mock).mockResolvedValue({ data: new Blob() });

    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsPage />);
    });
    await flushPromises();

    const link = div.querySelector('[data-testid="booking-receipt-link"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/api/v1/payments/pay_123/receipt");

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("renders the help prompt", async () => {
    (useParams as jest.Mock).mockReturnValue({ id: "3" });
    (getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 3,
        artist_id: 2,
        client_id: 3,
        service_id: 4,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        status: "confirmed",
        total_price: 100,
        notes: "",
        
        payment_status: "pending",
        service: { title: "Gig", artist: { business_name: "Artist" } },
        client: { id: 3 },
      },
    });
    (downloadBookingIcs as jest.Mock).mockResolvedValue({ data: new Blob() });

    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsPage />);
    });
    await flushPromises();

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("shows a link to message the artist", async () => {
    (useParams as jest.Mock).mockReturnValue({ id: "4" });
    (getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 4,
        artist_id: 2,
        client_id: 3,
        service_id: 4,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        status: "confirmed",
        total_price: 100,
        notes: "",
        payment_status: "paid",
        service: { title: "Gig", artist: { business_name: "Artist" } },
        client: { id: 3 },
        booking_request_id: 7,
      },
    });
    (downloadBookingIcs as jest.Mock).mockResolvedValue({ data: new Blob() });

    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsPage />);
    });
    await flushPromises();
    await flushPromises();

    const msg = div.querySelector('[data-testid="message-artist-link"]');
    expect(msg).not.toBeNull();
    expect(msg?.getAttribute("href")).toBe("/booking-requests/7");
    const artistLink = div.querySelector('[data-testid="view-artist-link"]');
    expect(artistLink?.getAttribute("href")).toBe("/service-providers/2");

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("opens the payment modal when ?pay=1 and payment pending", async () => {
    (useParams as jest.Mock).mockReturnValue({ id: "5" });
    (useSearchParams as jest.Mock).mockReturnValue({
      get: (key: string) => (key === "pay" ? "1" : null),
    });
    (getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 5,
        artist_id: 2,
        client_id: 3,
        service_id: 4,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        status: "confirmed",
        total_price: 100,
        notes: "",
        
        payment_status: "pending",
        service: { title: "Gig", artist: { business_name: "Artist" } },
        client: { id: 3 },
      },
    });
    (downloadBookingIcs as jest.Mock).mockResolvedValue({ data: new Blob() });

    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsPage />);
    });
    await flushPromises();

    const modalHeading = div.querySelector("h2");
    expect(modalHeading?.textContent).toContain("Pay Now");

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
