import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArtistDashboardPage from "@/app/dashboard/artist/page";
import * as api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams, usePathname } from "@/tests/mocks/next-navigation";
import { Service } from "@/types";
import { UI_CATEGORY_TO_ID } from "@/lib/categoryMap";

jest.mock("@/lib/api");
jest.mock("@/contexts/AuthContext");

test("editing a DJ service opens the DJ wizard", async () => {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  usePathname.mockReturnValue("/dashboard/artist");
  useSearchParams.mockReturnValue({ get: (key: string) => (key === "tab" ? "services" : null) });
  (useAuth as jest.Mock).mockReturnValue({
    user: {
      id: 1,
      user_type: "service_provider",
      email: "dj@example.com",
      first_name: "DJ",
      last_name: "Tester",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
    loading: false,
  });
  (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
  (api.getServiceCategories as jest.Mock).mockResolvedValue({ data: [] });
  const djService = {
    id: 1,
    artist_id: 1,
    title: "Spin",
    description: "desc",
    media_url: "",
    price: 100,
    duration_minutes: 60,
    service_type: "Live Performance",
    display_order: 0,
    service_category_slug: "dj",
    service_category_id: UI_CATEGORY_TO_ID.dj,
  } as Service;
  (api.getServiceProviderServices as jest.Mock).mockResolvedValue({ data: [djService] });
  (api.getServiceProviderProfileMe as jest.Mock).mockResolvedValue({ data: {} });
  (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });
  (api.getDashboardStats as jest.Mock).mockResolvedValue({ data: {} });

  const user = userEvent.setup();
  render(<ArtistDashboardPage />);

  const editButton = await screen.findByText("Edit");
  await user.click(editButton);

  expect(await screen.findByText(/DJ Details/i)).toBeTruthy();
});

