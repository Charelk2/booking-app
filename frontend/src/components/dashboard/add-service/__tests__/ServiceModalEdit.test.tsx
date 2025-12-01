import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddServiceModalMusician from "../AddServiceModalMusician";
import * as api from "@/lib/api";
import { Service } from "@/types";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalMusician editing", () => {
  it("calls updateService on submit", async () => {
    const user = userEvent.setup();
    const service = {
      id: 1,
      artist_id: 1,
      title: "Old Title",
      description: "Existing service description that is long enough.",
      media_url: "img.jpg",
      price: 100,
      duration_minutes: 60,
      service_type: "Live Performance" as const,
      display_order: 0,
    } as Service;
    const spy = jest
      .spyOn(api, "updateService")
      .mockResolvedValue({ data: service });

    render(
      <AddServiceModalMusician
        isOpen
        service={service}
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    // Step through all wizard steps until the Review screen
    await user.click(screen.getByTestId("next"));
    await user.click(screen.getByTestId("next"));
    await user.click(screen.getByTestId("next"));
    await user.click(screen.getByTestId("next"));
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));
    await flushPromises();

    expect(spy).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        service_category_slug: "musician",
      }),
    );
  });
});
