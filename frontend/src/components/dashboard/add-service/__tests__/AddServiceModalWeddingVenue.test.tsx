import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalWeddingVenue from "../AddServiceModalWeddingVenue";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalWeddingVenue", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalWeddingVenue
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Wedding Venue Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Hall");
    await user.type(screen.getByLabelText(/Price/i), "500");
    await user.type(screen.getByLabelText(/Capacity/i), "200");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "venue.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Hall",
        price: 500,
        service_type: "Other",
        details: { capacity: 200 },
        media_url: expect.stringContaining("base64"),
        service_category_slug: "wedding_venue",
      }),
    );
  });
});

