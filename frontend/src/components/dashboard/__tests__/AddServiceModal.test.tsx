import { createRoot } from "react-dom/client";
import React from "react";
import { act } from "react";
import AddServiceModal from "../AddServiceModal";
import * as api from "@/lib/api";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModal wizard", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.spyOn(api, "createService").mockResolvedValue({ data: { id: 1 } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it.skip("completes the flow and publishes the service", async () => {
    await act(async () => {
      root.render(
        React.createElement(AddServiceModal, {
          isOpen: true,
          onClose: jest.fn(),
          onServiceSaved: jest.fn(),
        }),
      );
    });

    const typeButton = document.querySelector(
      'button[data-value="Live Performance"]',
    ) as HTMLButtonElement;
    await act(async () => {
      typeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });
    const next1 = document.querySelector(
      'button[data-testid="next"]',
    ) as HTMLButtonElement;
    await act(async () => {
      next1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const titleInput = document.querySelector(
      'input[name="title"]',
    ) as HTMLInputElement;
    const descInput = document.querySelector(
      'textarea[name="description"]',
    ) as HTMLTextAreaElement;
    const durationInput = document.querySelector(
      'input[name="duration_minutes"]',
    ) as HTMLInputElement;
    const priceInput = document.querySelector(
      'input[name="price"]',
    ) as HTMLInputElement;

    act(() => {
      titleInput.value = "My Service";
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      descInput.value = "A great service description that is long enough.";
      descInput.dispatchEvent(new Event("input", { bubbles: true }));
      durationInput.value = "30";
      durationInput.dispatchEvent(new Event("input", { bubbles: true }));
      priceInput.value = "100";
      priceInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const next2 = document.querySelector(
      'button[data-testid="next"]',
    ) as HTMLButtonElement;
    await act(async () => {
      next2.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["a"], "a.jpg", { type: "image/jpeg" });
    await act(async () => {
      Object.defineProperty(fileInput, "files", { value: [file] });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const next3 = document.querySelector(
      'button[data-testid="next"]',
    ) as HTMLButtonElement;
    await act(async () => {
      next3.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Review step should show travel details before publishing
    expect(document.body.textContent).toContain("Travelling (Rand per km)");
    expect(document.body.textContent).toContain("Members travelling");
    expect(document.body.textContent).toContain("Car rental price");
    expect(document.body.textContent).toContain("Return flight price (per person)");

    const publish = document.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    await act(async () => {
      publish.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(api.createService).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "My Service",
        description: "A great service description that is long enough.",
        service_type: "Live Performance",
        duration_minutes: 30,
        price: 100,
        travel_rate: 2.5,
        travel_members: 1,
        car_rental_price: 1000,
        flight_price: 2780,
        media_url: expect.any(String),
      }),
    );
  });

  it("closes when pressing Escape", async () => {
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(AddServiceModal, {
          isOpen: true,
          onClose,
          onServiceSaved: jest.fn(),
        }),
      );
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Cancel clicked on first step", async () => {
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(AddServiceModal, {
          isOpen: true,
          onClose,
          onServiceSaved: jest.fn(),
        }),
      );
    });

    const cancelBtn = document.querySelector(
      'button[data-testid="back"]',
    ) as HTMLButtonElement;
    await act(async () => {
      cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });
});
