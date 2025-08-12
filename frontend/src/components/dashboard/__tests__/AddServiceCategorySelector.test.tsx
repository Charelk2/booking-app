import { createRoot } from "react-dom/client";
import React from "react";
import { act } from "react";
import { AddServiceCategorySelector } from "..";

describe("AddServiceCategorySelector", () => {
  it("calls onSelect with category id", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AddServiceCategorySelector, {
          isOpen: true,
          onClose,
          onSelect,
        })
      );
    });

    const button = document.body.querySelector(
      'button[data-testid="category-musician"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith("musician");
    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it("handles selecting DJ category", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AddServiceCategorySelector, {
          isOpen: true,
          onClose,
          onSelect,
        })
      );
    });

    const button = document.body.querySelector(
      'button[data-testid="category-dj"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith("dj");
    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it("handles selecting Sound Service category", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AddServiceCategorySelector, {
          isOpen: true,
          onClose,
          onSelect,
        })
      );
    });

    const button = document.body.querySelector(
      'button[data-testid="category-sound_service"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith("sound_service");
    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it("renders panel full screen", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(AddServiceCategorySelector, {
          isOpen: true,
          onClose,
          onSelect,
        })
      );
    });

    const panel = document.body.querySelector(
      "div.relative.z-10.flex.h-full.w-full"
    );
    expect(panel).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
