import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalEventService from "../AddServiceModalEventService";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalEventService", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalEventService
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Event Service Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Setup");
    await user.type(screen.getByLabelText(/Price/i), "150");
    await user.type(screen.getByLabelText(/Description/i), "Lighting");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "event.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Setup",
        price: 150,
        service_type: "Other",
        details: { description: "Lighting" },
        media_url: expect.stringContaining("base64"),
        service_category_slug: "event_service",
      }),
    );
  });
});

