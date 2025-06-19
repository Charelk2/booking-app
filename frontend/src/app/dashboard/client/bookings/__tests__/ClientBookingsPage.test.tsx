import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import ClientBookingsPage from "../page";
import { getMyClientBookings, getBookingDetails } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

jest.mock("@/lib/api");
jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => "/dashboard/client/bookings"),
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

describe("ClientBookingsPage", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders upcoming and past bookings with deposit info", async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        user_type: "client",
        email: "c@example.com",
        first_name: "C",
      },
    });
    (getMyClientBookings as jest.Mock)
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: "confirmed",
            total_price: 100,
            notes: "",
            deposit_amount: 50,
            deposit_due_by: new Date("2024-01-08").toISOString(),
            payment_status: "deposit_paid",
            payment_id: "pay_upcoming",
            service: { title: "Gig" },
            client: { id: 1 },
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 2,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: "completed",
            total_price: 200,
            notes: "",
            deposit_amount: 100,
            payment_status: "paid",
            service: { title: "Gig" },
            client: { id: 1 },
          },
        ],
      });

    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientBookingsPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getMyClientBookings).toHaveBeenCalledWith({ status: "upcoming" });
    expect(getMyClientBookings).toHaveBeenCalledWith({ status: "past" });
    expect(div.textContent).toContain("Upcoming Bookings");
    expect(div.textContent).toContain("Past Bookings");
    expect(div.textContent).toContain("Deposit:");
    expect(div.textContent).toContain("Deposit Paid");
    expect(div.textContent).not.toContain("Deposit due by");
    expect(div.textContent).toContain("Requested");
    expect(div.textContent).toContain("Completed");
    const link = div.querySelector('a[data-booking-id="1"]');
    expect(link?.getAttribute("href")).toBe("/dashboard/client/bookings/1");
    const artistLink = div.querySelector('[data-testid="view-artist-link"]');
    expect(artistLink?.getAttribute("href")).toBe("/artists/2");
    const receipt = div.querySelector('[data-testid="booking-receipt-link"]');
    expect(receipt?.getAttribute("href")).toBe(
      "/api/v1/payments/pay_upcoming/receipt",
    );
    const help = div.querySelector('[data-testid="help-prompt"]');
    expect(help).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("shows review button for completed bookings", async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        user_type: "client",
        email: "c@example.com",
        first_name: "C",
      },
    });
    (getMyClientBookings as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 9,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: "completed",
            total_price: 100,
            notes: "",
            deposit_amount: 50,
            payment_status: "deposit_paid",
            service: { title: "Gig" },
            client: { id: 1 },
          },
        ],
      });

    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientBookingsPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(div.textContent).toContain("Leave review");
    const help = div.querySelector('[data-testid="help-prompt"]');
    expect(help).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("opens payment modal with deposit amount when clicking pay button", async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        user_type: "client",
        email: "c@example.com",
        first_name: "C",
      },
    });
    (getMyClientBookings as jest.Mock)
      .mockResolvedValueOnce({
        data: [
          {
            id: 5,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: "confirmed",
            total_price: 120,
            notes: "",
            deposit_amount: 60,
            payment_status: "pending",
            service: { title: "Gig" },
            client: { id: 1 },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });
    (getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 5,
        artist_id: 2,
        client_id: 1,
        service_id: 4,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        status: "confirmed",
        total_price: 120,
        notes: "",
        deposit_amount: 80,
        payment_status: "pending",
        service: { title: "Gig" },
        client: { id: 1 },
        source_quote: { booking_request_id: 5 },
      },
    });

    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientBookingsPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const payBtn = div.querySelector(
      '[data-testid="pay-deposit-button"]',
    ) as HTMLButtonElement;
    expect(payBtn).not.toBeNull();

    await act(async () => {
      payBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getBookingDetails).toHaveBeenCalledWith(5);
    const input = div.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe(formatCurrency(80));

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("links each booking card to the booking request", async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        user_type: "client",
        email: "c@example.com",
        first_name: "C",
      },
    });
    (getMyClientBookings as jest.Mock)
      .mockResolvedValueOnce({
        data: [
          {
            id: 8,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: "confirmed",
            total_price: 150,
            notes: "",
            deposit_amount: 50,
            payment_status: "deposit_paid",
            service: { title: "Gig" },
            client: { id: 1 },
            source_quote: { booking_request_id: 12 },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientBookingsPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const msgLink = div.querySelector('[data-testid="message-artist-link"]');
    expect(msgLink).not.toBeNull();
    expect(msgLink?.getAttribute("href")).toBe("/booking-requests/12");
    const artistLink = div.querySelector('[data-testid="view-artist-link"]');
    expect(artistLink?.getAttribute("href")).toBe("/artists/2");

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it("shows alert when there are pending deposits", async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        user_type: "client",
        email: "c@example.com",
        first_name: "C",
      },
    });
    (getMyClientBookings as jest.Mock)
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date("2023-01-01").toISOString(),
            end_time: new Date("2023-01-01").toISOString(),
            status: "confirmed",
            total_price: 100,
            notes: "",
            deposit_amount: 50,
            payment_status: "pending",
            service: { title: "Gig" },
            client: { id: 1 },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientBookingsPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const alert = div.querySelector('[data-testid="pending-payment-alert"]');
    expect(alert).not.toBeNull();
    const link = alert?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/dashboard/client/bookings/1");

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
