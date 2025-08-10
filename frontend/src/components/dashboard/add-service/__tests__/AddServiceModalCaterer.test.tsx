import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalCaterer from "../AddServiceModalCaterer";
import { flushPromises } from "@/test/utils/flush";
import { UI_CATEGORY_TO_ID } from "@/lib/categoryMap";

describe("AddServiceModalCaterer", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalCaterer
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Caterer Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Food");
    await user.type(screen.getByLabelText(/Price/i), "300");
    await user.type(screen.getByLabelText(/Cuisine/i), "Italian");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "caterer.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Food",
        price: 300,
        service_type: "Other",
        details: { cuisine: "Italian" },
        media_url: expect.stringContaining("base64"),
        service_category_id: UI_CATEGORY_TO_ID.caterer,
      }),
    );
  });
});

