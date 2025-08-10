import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalPhotographer from "../AddServiceModalPhotographer";
import { flushPromises } from "@/test/utils/flush";
import { UI_CATEGORY_TO_ID } from "@/lib/categoryMap";

describe("AddServiceModalPhotographer", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalPhotographer
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    // validation
    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Photographer Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Shoot");
    await user.type(screen.getByLabelText(/Price/i), "200");
    await user.type(screen.getByLabelText(/Camera Brand/i), "Canon");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "cam.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    // back flow
    await user.click(screen.getByTestId("back"));
    expect(screen.getByLabelText(/Media/i)).toBeTruthy();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Shoot",
        price: 200,
        service_type: "Other",
        details: { camera_brand: "Canon" },
        media_url: expect.stringContaining("base64"),
        service_category_id: UI_CATEGORY_TO_ID.photographer,
      }),
    );
  });
});
