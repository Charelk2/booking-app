import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalDJ from "../AddServiceModalDJ";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalDJ", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalDJ
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/DJ Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Spin");
    await user.type(screen.getByLabelText(/Price/i), "200");
    await user.type(screen.getByLabelText(/Genre/i), "EDM");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "dj.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Spin",
        price: 200,
        service_type: "Live Performance",
        details: { genre: "EDM" },
        media_url: expect.stringContaining("base64"),
      }),
    );
  });
});

