import { createRoot } from "react-dom/client";
import React from "react";
import { act } from "react";
import AddServiceCategorySelector from "../AddServiceCategorySelector";

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

  it("handles selecting newly added categories", async () => {
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
      'button[data-testid="category-speaker"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith("speaker");
    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});
