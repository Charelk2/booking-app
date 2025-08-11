import { createRoot } from "react-dom/client";
import React from "react";
import { act } from "react-dom/test-utils";
import TimeAgo from "../TimeAgo";

describe("TimeAgo component", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    jest.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("updates relative time periodically", () => {
    act(() => {
      root.render(
        <TimeAgo timestamp="2025-01-01T11:59:00Z" intervalMs={60000} />,
      );
    });
    const timeEl = container.querySelector("time") as HTMLElement;
    const firstText = timeEl.textContent;

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    const secondText = timeEl.textContent;
    expect(secondText).not.toBe(firstText);
  });

  it("renders a fallback for invalid timestamps", () => {
    act(() => {
      root.render(<TimeAgo timestamp="not-a-date" />);
    });
    const timeEl = container.querySelector("time") as HTMLElement;
    expect(timeEl.textContent).toBe("Invalid date");
  });
});
