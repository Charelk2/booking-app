import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalVideographer from "../AddServiceModalVideographer";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalVideographer", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalVideographer
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Videographer Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Shoot");
    await user.type(screen.getByLabelText(/Price/i), "100");
    await user.type(screen.getByLabelText(/Video Style/i), "Cinematic");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "vid.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Shoot",
        price: 100,
        service_type: "Other",
        details: { video_style: "Cinematic" },
        media_url: expect.stringContaining("base64"),
        service_category_slug: "videographer",
      }),
    );
  });
});

