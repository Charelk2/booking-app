import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalMusician from "../AddServiceModalMusician";
import { flushPromises } from "@/test/utils/flush";
import { UI_CATEGORY_TO_ID } from "@/lib/categoryMap";

describe("AddServiceModalMusician", () => {
  it.skip("validates required fields and submits payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalMusician
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />, 
    );

    const typeBtn = await screen.findByRole("button", {
      name: /Live Performance/i,
    });
    await user.click(typeBtn);
    const nextBtn = screen.getByTestId("next");
    await waitFor(() => expect(nextBtn).not.toBeDisabled());
    await user.click(nextBtn);

    await user.type(screen.getByLabelText(/Service Title/i), "Great Gig");
    await user.type(
      screen.getByLabelText(/Description/i),
      "This is a wonderful service description.",
    );
    await user.type(screen.getByLabelText(/Price/i), "100");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "pic.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/Drag files here/i);
    await user.upload(input, file);
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Great Gig",
        description: "This is a wonderful service description.",
        price: 100,
        service_type: "Live Performance",
        media_url: expect.stringContaining("base64"),
        service_category_slug: "musician",
      }),
    );
  });

  it("lists available event services by city", async () => {
    const user = userEvent.setup();
    const eventSvc = {
      id: 1,
      title: "Mega Sound",
      service_category_id: UI_CATEGORY_TO_ID.event_service,
      details: { coverage_areas: ["CPT", "JNB"] },
    } as any;
    jest.spyOn(api, "getAllServices").mockResolvedValue({ data: [eventSvc] } as any);

    render(
      <AddServiceModalMusician
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    // Step 0: select service type and proceed
    await user.click(
      await screen.findByRole("button", { name: /Live Performance/i }),
    );
    await user.click(screen.getByTestId("next"));

    // Choose external providers and add a city preference
    await user.click(screen.getByText(/Use external providers/i));
    await user.click(screen.getByText(/\+ Add city/i));
    const citySelect = screen.getByLabelText(/City 1/i);
    await user.selectOptions(citySelect, "CPT");

    // Provider matching the city should appear
    await screen.findByText("Mega Sound");
  });
});
