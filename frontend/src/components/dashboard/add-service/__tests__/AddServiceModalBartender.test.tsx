import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalBartender from "../AddServiceModalBartender";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalBartender", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalBartender
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Bartender Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Mix");
    await user.type(screen.getByLabelText(/Price/i), "120");
    await user.type(screen.getByLabelText(/Signature Drink/i), "Mojito");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "bartender.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Mix",
        price: 120,
        service_type: "Other",
        details: { signature_drink: "Mojito" },
        media_url: expect.stringContaining("base64"),
        service_category_slug: "bartender",
      }),
    );
  });
});

