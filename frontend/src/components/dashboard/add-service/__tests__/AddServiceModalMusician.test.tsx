import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalMusician from "../AddServiceModalMusician";
import { flushPromises } from "@/test/utils/flush";

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
});
