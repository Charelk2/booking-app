import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArtistDashboardPage from "@/app/dashboard/artist/page";
import * as api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams, usePathname } from "@/tests/mocks/next-navigation";
import { Service } from "@/types";

jest.mock("@/lib/api");
jest.mock("@/contexts/AuthContext");

test("editing an event service opens the event service wizard", async () => {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  usePathname.mockReturnValue("/dashboard/artist");
  useSearchParams.mockReturnValue({ get: (key: string) => (key === "tab" ? "services" : null) });
  (useAuth as jest.Mock).mockReturnValue({
    user: {
      id: 1,
      user_type: "service_provider",
      email: "sound@example.com",
      first_name: "Sound",
      last_name: "Engineer",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
    loading: false,
  });
  (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
  (api.getServiceCategories as jest.Mock).mockResolvedValue({ data: [] });
  const eventService = {
    id: 1,
    artist_id: 1,
    title: "PA Rental",
    description: "desc",
    media_url: "",
    price: 500,
    duration_minutes: 60,
    service_type: "Other",
    display_order: 0,
    details: { travel_fee_policy: "flat" },
  } as Service;
  (api.getServiceProviderServices as jest.Mock).mockResolvedValue({ data: [eventService] });
  (api.getServiceProviderProfileMe as jest.Mock).mockResolvedValue({ data: {} });
  (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });
  (api.getDashboardStats as jest.Mock).mockResolvedValue({ data: {} });

  const user = userEvent.setup();
  render(<ArtistDashboardPage />);

  const editButton = await screen.findByText("Edit");
  await user.click(editButton);

  expect(await screen.findByText(/Service Type: Sound/i)).toBeTruthy();
});
