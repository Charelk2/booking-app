import React from 'react';
import { render, screen } from '@testing-library/react';
import BookingSummaryCard from '@/components/chat/BookingSummaryCard';

describe('14 Nov 2025 – booking summary dates', () => {
  it('renders booking summary header and event details dates as "Sat, 14 March, 2026"', () => {
    const iso = '2026-03-14T00:00:00.000Z';

    render(
      <BookingSummaryCard
        parsedBookingDetails={{ date: iso, location: '10 Retief St', eventType: 'Birthday' }}
        imageUrl={null}
        serviceName="Booking Details"
        artistName="Jan Blohm"
        bookingConfirmed={false}
        paymentInfo={{ status: null, amount: null, receiptUrl: null }}
        bookingDetails={null as any}
        quotes={{}}
        allowInstantBooking={false}
        openPaymentModal={jest.fn()}
        bookingRequestId={1}
        baseFee={0}
        travelFee={0}
        initialSound={false}
        artistCancellationPolicy={null}
        currentArtistId={0}
      />,
    );

    const occurrences = screen.getAllByText(/Sat, 14 March, 2026/);
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

});
