import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalSoundService from "../AddServiceModalSoundService";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalSoundService", () => {
  it("follows expanded step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalSoundService
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    // Step 1: Basics
    expect(screen.getAllByText(/Basics/i).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText(/Service Name/i), "Setup");
    await user.type(screen.getByLabelText(/Short Summary/i), "Lighting");
    await user.type(screen.getByLabelText(/List Price/i), "150");
    await user.click(screen.getByTestId("next"));

    // Step 2: Media
    const file = new File(["hello"], "event.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByTestId("media-input"), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    // Step 3: Coverage & Logistics
    await user.click(screen.getByTestId("next"));
    // Step 4: Capabilities & Inventory
    await user.click(screen.getByTestId("next"));
    // Step 5: Packages & Pricing
    await user.click(screen.getByTestId("next"));
    // Step 6: SLAs & Availability
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Setup",
        price: 150,
        service_type: "Other",
        details: expect.objectContaining({ short_summary: "Lighting" }),
        media_url: expect.stringContaining("base64"),
        service_category_slug: "sound_service",
      }),
    );
  });
});
