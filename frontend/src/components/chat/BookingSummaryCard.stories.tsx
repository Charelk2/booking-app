import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import BookingSummaryCard from './BookingSummaryCard';

const basePaymentInfo = {
  status: null,
  amount: null,
  receiptUrl: null,
  reference: null,
};

const meta = {
  component: BookingSummaryCard,
  args: {
    bookingConfirmed: false,
    paymentInfo: basePaymentInfo,
    bookingDetails: null,
    quotes: {},
    openPaymentModal: () => {},
    bookingRequestId: 123,
    baseFee: 0,
    travelFee: 0,
    currentArtistId: 1,
    allowInstantBooking: false,
    showTravel: true,
    showSound: true,
    showPolicy: true,
    showReceiptBelowTotal: false,
    showEventDetails: true,
    parsedBookingDetails: {
      eventType: 'Birthday Party',
      date: new Date().toISOString(),
      location: 'Cape Town, South Africa',
      guests: '120',
    },
    serviceName: 'Acoustic Band',
    artistName: 'Demo Artist',
  },
} satisfies Meta<typeof BookingSummaryCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
