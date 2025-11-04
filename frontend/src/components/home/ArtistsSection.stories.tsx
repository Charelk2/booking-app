import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ServiceProviderProfile } from '@/types';

import ArtistsSection from './ArtistsSection';

const demoArtist = {
  id: 1,
  user_id: 1,
  business_name: 'Demo Artist',
  primary_role: 'DJ',
  custom_subtitle: 'House & Lounge Specialist',
  description: null,
  location: 'Cape Town',
  hourly_rate: 5000,
  profile_picture_url: null,
  cover_photo_url: null,
  portfolio_urls: null,
  portfolio_image_urls: null,
  specialties: null,
  languages: ['English'],
  owns_pa: true,
  insured: false,
  verified: true,
  bookings_count: 120,
  avg_response_minutes: 45,
  cancellation_policy: null,
  onboarding_completed: true,
  profile_complete: true,
  rating: 4.9,
  rating_avg: 4.9,
  rating_count: 87,
  is_available: true,
  price_visible: true,
  service_price: null,
  service_categories: ['DJ', 'Lighting'],
  user: {
    id: 1,
    email: 'demo-artist@example.com',
    user_type: 'service_provider',
    first_name: 'Demo',
    last_name: 'Artist',
    phone_number: '+27110000000',
    is_active: true,
    is_verified: true,
    mfa_enabled: false,
    profile_picture_url: null,
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} satisfies ServiceProviderProfile;

const meta = {
  component: ArtistsSection,
  args: {
    title: 'Featured Artists',
    query: { category: 'music' },
    limit: 4,
    hideIfEmpty: false,
    initialData: [demoArtist],
    deferUntilVisible: false,
  },
} satisfies Meta<typeof ArtistsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
