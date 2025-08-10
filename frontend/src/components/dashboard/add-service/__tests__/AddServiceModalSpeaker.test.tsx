import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";
import AddServiceModalSpeaker from "../AddServiceModalSpeaker";
import { flushPromises } from "@/test/utils/flush";
import { UI_CATEGORY_TO_ID } from "@/lib/categoryMap";

describe("AddServiceModalSpeaker", () => {
  it("follows step flow and sends details payload", async () => {
    const user = userEvent.setup();
    const createSpy = jest
      .spyOn(api, "createService")
      .mockResolvedValue({ data: {} } as any);

    render(
      <AddServiceModalSpeaker
        isOpen
        onClose={() => {}}
        onServiceSaved={() => {}}
      />,
    );

    await user.click(screen.getByTestId("next"));
    expect(screen.getByText(/Speaker Details/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/i), "Talk");
    await user.type(screen.getByLabelText(/Price/i), "80");
    await user.type(screen.getByLabelText(/Topic/i), "Motivation");
    await user.click(screen.getByTestId("next"));

    const file = new File(["hello"], "speaker.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Media/i), file);
    await flushPromises();
    await user.click(screen.getByTestId("next"));

    await user.click(screen.getByRole("button", { name: /Publish/i }));
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Talk",
        price: 80,
        service_type: "Other",
        details: { topic: "Motivation" },
        media_url: expect.stringContaining("base64"),
        service_category_id: UI_CATEGORY_TO_ID.speaker,
      }),
    );
  });
});

