import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalMusician from "../AddServiceModalMusician";
import { flushPromises } from "@/test/utils/flush";

describe("AddServiceModalMusician", () => {
  it("validates required fields and submits payload", async () => {
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

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Musician Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Gig");
    await user.type(screen.getByLabelText(/Price/i), "100");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "pic.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/Media/i);
    await user.upload(input, file);
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Gig",
        price: 100,
        service_type: "Live Performance",
        media_url: expect.stringContaining("base64"),
      }),
    );
  });
});
