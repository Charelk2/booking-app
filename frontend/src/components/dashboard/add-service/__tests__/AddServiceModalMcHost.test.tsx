import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalMcHost from "../AddServiceModalMcHost";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalMcHost", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalMcHost
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/MC & Host Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Host");
    await user.type(screen.getByLabelText(/Price/i), "90");
    await user.type(screen.getByLabelText(/Hosting Style/i), "Formal");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "mc.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Host",
        price: 90,
        service_type: "Other",
        details: { hosting_style: "Formal" },
        media_url: expect.stringContaining("base64"),
        service_category_slug: "mc_host",
      }),
    );
  });
});

