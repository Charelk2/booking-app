import { flushPromises } from "@/test/utils/flush";
import { createRoot } from "react-dom/client";
import React from "react";
import { act } from "react";
import BookingWizard from "../BookingWizard";
import { BookingProvider, useBooking } from "@/contexts/BookingContext";
import * as api from "@/lib/api";

jest.mock("@/lib/api");

function Wrapper() {
  return (
    <BookingProvider>
      <ExposeSetter />
      <BookingWizard artistId={1} isOpen onClose={() => {}} />
    </BookingProvider>
  );
}

function ExposeSetter() {
  const { setStep } = useBooking();
  // Cast to unknown first to avoid eslint no-explicit-any complaint
  (window as unknown as { __setStep: (step: number) => void }).__setStep =
    setStep;
  return null;
}

describe("BookingWizard flow", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
    (api.getArtistAvailability as jest.Mock).mockResolvedValue({
      data: { unavailable_dates: [] },
    });
    (api.getArtist as jest.Mock).mockResolvedValue({
      data: { location: "NYC" },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom does not implement scrollTo, so provide a stub
    // @ts-expect-error - jsdom does not implement scrollTo
    window.scrollTo = jest.fn();

    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  function getButton(label: string): HTMLButtonElement {
    return Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(label),
    ) as HTMLButtonElement;
  }

  it("scrolls to top when advancing steps", async () => {
    const nextButton = getButton("Next");
    await act(async () => {
      nextButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it("advances to the next step when pressing Enter on desktop", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    await flushPromises();
    const heading = container.querySelector('[data-testid="step-heading"]');
    expect(heading?.textContent).toContain("Event Type");
  });

  it("shows step heading and updates on next", async () => {
    const heading = () =>
      container.querySelector('[data-testid="step-heading"]')?.textContent;
    expect(heading()).toContain("Date & Time");
    const next = getButton("Next");
    await act(async () => {
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    expect(heading()).toContain("Event Type");
  });

  it("collapses inactive steps on mobile", async () => {
    const sections = () =>
      Array.from(
        container.querySelectorAll("section button[aria-controls]"),
      ) as HTMLButtonElement[];
    expect(sections()[0].getAttribute("aria-expanded")).toBe("true");
    expect(sections()[1].getAttribute("aria-expanded")).toBe("false");
    const next = getButton("Next");
    await act(async () => {
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    const updated = sections();
    expect(updated[0].getAttribute("aria-expanded")).toBe("false");
    expect(updated[1].getAttribute("aria-expanded")).toBe("true");
  });

  it("shows summary only on the review step", async () => {

  
    expect(container.querySelector("h2")?.textContent).toContain("Date & Time");
    expect(container.textContent).not.toContain("Date:");

        
    const setStep = (window as unknown as { __setStep: (s: number) => void })
      .__setStep;
    await act(async () => {
      setStep(8);
    });
    await flushPromises();
    expect(container.querySelector("h2")?.textContent).toContain("Review");
    expect(container.textContent).toContain("Booking Summary");
  });

  it("allows navigating back via the progress bar", async () => {
    const next = getButton("Next");
    await act(async () => {
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    const progressButtons = container.querySelectorAll(
      '[aria-label="Progress"] button',
    );
    expect(progressButtons.length).toBeGreaterThan(1);
    await act(async () => {
      progressButtons[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushPromises();
    expect(
      container.querySelector('[data-testid="step-heading"]')?.textContent,
    ).toContain("Date & Time");
  });

  it("keeps future completed steps clickable when rewinding", async () => {
    const setStep = (window as unknown as { __setStep: (s: number) => void })
      .__setStep;
    await act(async () => {
      setStep(4);
    });
    await flushPromises();
    let progressButtons = container.querySelectorAll(
      '[aria-label="Progress"] button',
    );
    await act(async () => {
      progressButtons[3].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushPromises();
    // query again after DOM update
    progressButtons = container.querySelectorAll(
      '[aria-label="Progress"] button',
    );
    expect((progressButtons[4] as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a loader while fetching availability", async () => {
    let resolve: (value: { data: { unavailable_dates: string[] } }) => void;
    (api.getArtistAvailability as jest.Mock).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    act(() => {
      root.unmount();
    });
    container.innerHTML = "";
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
    const skeleton = container.querySelector(
      '[data-testid="calendar-skeleton"]',
    );
    expect(skeleton).not.toBeNull();
    act(() => resolve({ data: { unavailable_dates: [] } }));
    await flushPromises();
    expect(
      container.querySelector('[data-testid="calendar-skeleton"]'),
    ).toBeNull();
  });

  it("does not make the progress indicator sticky on mobile", () => {
    const wrapper = container.querySelector(
      '[data-testid="progress-container"]',
    ) as HTMLDivElement | null;
    expect(wrapper?.className).not.toContain("sticky");
  });

  it("announces progress updates for screen readers", async () => {
    const progress = () =>
      container.querySelector('[data-testid="progress-status"]')?.textContent;
    expect(progress()).toBe("Step 1 of 9");
    const next = getButton("Next");
    await act(async () => {
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    expect(progress()).toBe("Step 2 of 9");
  });

  it("moves focus to the step heading when advancing", async () => {
    const next = getButton("Next");
    await act(async () => {
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    const heading = container.querySelector('[data-testid="step-heading"]');
    expect(document.activeElement).toBe(heading);
  });

  it("disables dates returned from Google Calendar", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    (api.getArtistAvailability as jest.Mock).mockResolvedValue({
      data: { unavailable_dates: ["2025-01-02"] },
    });
    act(() => {
      root.unmount();
    });
    container.innerHTML = "";
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
    await flushPromises();
    const disabledButtons = container.querySelectorAll("button[disabled]");
    expect(disabledButtons.length).toBeGreaterThan(1);
    jest.useRealTimers();
  });

  it("restores progress from localStorage on reload", async () => {
    (window as unknown as { confirm: jest.Mock }).confirm = jest.fn(() => true);
    const next = getButton("Next");
    await act(async () => {
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    const stored = JSON.parse(localStorage.getItem("bookingState")!);
    expect(stored.step).toBe(3);

    act(() => {
      root.unmount();
    });
    container.innerHTML = "";
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
    await flushPromises();
    expect(
      container.querySelector('[data-testid="step-heading"]')?.textContent,
    ).toContain("Location");
  });

  it("clears saved progress when starting over", async () => {
    act(() => {
      root.unmount();
    });
    localStorage.setItem(
      "bookingState",
      JSON.stringify({
        step: 4,
        details: {
          date: new Date().toISOString(),
          location: "LA",
          guests: "10",
          venueType: "indoor",
          sound: "yes",
        },
      }),
    );
    (window as unknown as { confirm: jest.Mock }).confirm = jest.fn(
      () => false,
    );
    container.innerHTML = "";
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
    await flushPromises();
    expect(localStorage.getItem("bookingState")).toBeNull();
    expect(
      container.querySelector('[data-testid="step-heading"]')?.textContent,
    ).toContain("Date & Time");
  });
});
