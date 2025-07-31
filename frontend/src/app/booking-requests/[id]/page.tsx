'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import MessageThread from '@/components/booking/MessageThread';
import PersonalizedVideoFlow from '@/components/booking/PersonalizedVideoFlow';
import BookingTimeline from '@/components/booking/BookingTimeline';
import {
  getBookingRequestById,
  getArtist,
  getMessagesForBookingRequest,
} from '@/lib/api';
import { Spinner } from '@/components/ui';
import { BookingRequest } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { format, parseISO, isValid } from 'date-fns';
import { motion } from 'framer-motion';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import {
  ParsedBookingDetails,
  parseBookingDetailsFromMessage,
} from '@/lib/bookingDetails';


export default function BookingRequestDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { user } = useAuth();
  const [request, setRequest] = useState<BookingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artistAvatar, setArtistAvatar] = useState<string | null>(null);
  const [artistName, setArtistName] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [parsedBookingDetails, setParsedBookingDetails] = useState<ParsedBookingDetails | null>(null);
  const [initialSoundNeeded, setInitialSoundNeeded] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    const fetchRequest = async () => {
      try {
        const res = await getBookingRequestById(id);
        setRequest(res.data);
        const artistId = res.data.artist_id;
        try {
          const artistRes = await getArtist(artistId);
          setArtistAvatar(artistRes.data.profile_picture_url ?? null);
          setArtistName(
            artistRes.data.business_name || artistRes.data.user.first_name,
          );
        } catch (err) {
          console.error('Failed to load artist profile:', err);
        }

        try {
          const msgRes = await getMessagesForBookingRequest(id);
          const detailsMsg = msgRes.data.find(
            (m_item) =>
              m_item.message_type === 'system' &&
              m_item.content.startsWith(BOOKING_DETAILS_PREFIX),
          );
          if (detailsMsg) {
            const parsed = parseBookingDetailsFromMessage(detailsMsg.content);
            setParsedBookingDetails(parsed);
            if (parsed.soundNeeded) {
              setInitialSoundNeeded(parsed.soundNeeded.toLowerCase() === 'yes');
            }
          }
        } catch (err2) {
          console.error('Failed to load booking messages', err2);
        }
      } catch (err) {
        console.error('Failed to load booking request:', err);
        setError('Failed to load request');
      }
    };
    fetchRequest();
  }, [id]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view this request.</div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-8 text-red-600">{error}</div>
      </MainLayout>
    );
  }

  if (!request) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  const isParticipant =
    user.id === request.client_id || user.id === request.artist_id;
  if (!isParticipant) {
    return (
      <MainLayout>
        <div className="p-8">You are not authorized to view this request.</div>
      </MainLayout>
    );
  }

  // Helper function to clean location string
  const cleanLocation = (locationString: string | undefined) => {
    if (!locationString) return 'N/A';
    let cleaned = locationString.replace(/,?\s*South Africa/gi, '');
    cleaned = cleaned.replace(/,\s*\d{4}\s*$/, '').trim();
    cleaned = cleaned.replace(/,$/, '').trim();
    return cleaned;
  };

  // Determine which date to use for display. Prioritize parsed details if available.
  const displayProposedDateTime = parsedBookingDetails?.date
    ? parseISO(parsedBookingDetails.date)
    : (request.proposed_datetime_1 ? parseISO(request.proposed_datetime_1) : null);

  // Derive initial quote data for the artist from the request object
  const initialBaseFee = request.service?.price ? Number(request.service.price) : undefined;
  const initialTravelCost =
    request.travel_cost !== null && request.travel_cost !== undefined
      ? Number(request.travel_cost)
      : undefined;
  const initialSoundNeededProp = initialSoundNeeded;


  return (
    <MainLayout>
      <div className="flex flex-col md:flex-row max-w-7xl mx-auto p-6 gap-6 min-h-[85vh]">
        {/* Booking Timeline on the Left */}
        <div className="md:w-1/4 lg:w-1/5 flex-shrink-0">
          <BookingTimeline status={request.status} />
        </div>

        {/* Main Content Area (Chat Thread) in the Middle */}
        <div className="flex-1">
          {/* Toggle button for sidebar on mobile */}
          <div className="md:hidden flex justify-end mb-4">
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              className="bg-indigo-600 text-white rounded-full p-2 shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
              aria-label={showSidebar ? "Hide booking details" : "Show booking details"}
            >
              <InformationCircleIcon className="h-5 w-5" />
              <span className="font-medium text-sm">{showSidebar ? "Hide Details" : "Show Details"}</span>
            </button>
          </div>

          {request.service?.service_type === 'Personalized Video' ? (
            <PersonalizedVideoFlow
              bookingRequestId={request.id}
              clientName={request.client?.first_name}
              artistName={artistName || request.artist?.first_name}
              artistAvatarUrl={artistAvatar}
            />
          ) : (
            <MessageThread
              bookingRequestId={request.id}
              serviceId={request.service_id ?? undefined}
              clientName={request.client?.first_name}
              artistName={artistName || request.artist?.first_name}
              artistAvatarUrl={artistAvatar}
              serviceName={request.service?.title}
              initialNotes={request.message ?? null}
              onBookingDetailsParsed={setParsedBookingDetails}
              initialBaseFee={initialBaseFee}
              initialTravelCost={initialTravelCost}
              initialSoundNeeded={initialSoundNeededProp}
            />
          )}
        </div>

        {/* Sidebar for Booking Details (Summary) on the Right */}
        <aside className={`${showSidebar ? 'block' : 'hidden'} md:block md:w-1/4 lg:w-1/5 bg-white-100 rounded-2xl p-6 border-white-100 flex-shrink-0`}>
          <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b border-gray-1-300 last:border-b-0 pb-2">Booking Details</h2>
          <div className="space-y-3 text-gray-700">
            {/* Always visible details */}
            <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
              <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Client</dt>
              <dd className="text-right text-sm flex-grow">
                {request.client ? `${request.client.first_name} ${request.client.last_name}` : 'N/A'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
              <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Email</dt>
              <dd className="text-right text-sm flex-grow overflow-hidden text-ellipsis whitespace-nowrap">
                {request.client?.email || 'N/A'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
              <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Service</dt>
              <dd className="text-right text-sm flex-grow">
                {request.service?.title || 'N/A'}
              </dd>
            </div>
            {parsedBookingDetails?.eventType && (
              <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
                <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Event Type</dt>
                <dd className="text-right text-sm flex-grow">{parsedBookingDetails.eventType}</dd>
              </div>
            )}
            {displayProposedDateTime && isValid(displayProposedDateTime) && (
              <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
                <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Date & Time</dt>
                <dd className="text-right text-sm flex-grow">
                  {format(displayProposedDateTime, 'PPP')}
                  {` at ${format(displayProposedDateTime, 'p')}`}
                </dd>
              </div>
            )}
            {parsedBookingDetails?.location && (
              <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
                <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Location</dt>
                <dd className="text-right text-sm flex-grow">
                  {cleanLocation(parsedBookingDetails.location)}
                </dd>
              </div>
            )}

            {/* Conditionally visible details */}
            <motion.div
              layout
              initial={false}
              animate={{ height: isDetailsExpanded ? 'auto' : 0, opacity: isDetailsExpanded ? 1 : 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              {parsedBookingDetails?.description && (
                <div className="flex items-start justify-between py-1 border-b border-gray-300 last:border-b-0">
                  <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Description</dt>
                  <dd className="text-right text-sm flex-grow">{parsedBookingDetails.description}</dd>
                </div>
              )}
              {parsedBookingDetails?.guests && (
                <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
                  <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Guests</dt>
                  <dd className="text-right text-sm flex-grow">{parsedBookingDetails.guests}</dd>
                </div>
              )}
              {parsedBookingDetails?.venueType && (
                <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
                  <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Venue Type</dt>
                  <dd className="text-right text-sm flex-grow">{parsedBookingDetails.venueType}</dd>
                </div>
              )}
              {parsedBookingDetails?.soundNeeded && (
                <div className="flex items-center justify-between py-1 border-b border-gray-300 last:border-b-0">
                  <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Sound Needed</dt>
                  <dd className="text-right text-sm flex-grow">
                    {parsedBookingDetails.soundNeeded === 'Yes' ? 'Yes' : 'No'}
                  </dd>
                </div>
              )}
              {parsedBookingDetails?.notes && (
                <div className="flex items-start justify-between py-1 border-b border-gray-300 last:border-b-0">
                  <dt className="font-medium text-gray-900 flex-shrink-0 w-1/3">Notes</dt>
                  <dd className="text-right text-sm flex-grow">{parsedBookingDetails.notes}</dd>
                </div>
              )}
            </motion.div>

            {/* Expand/Collapse Button */}
            <div className="flex justify-center w-full pt-2">
              <button
                onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                className="text-gray-500 hover:text-gray-800 font-medium py-2 text-sm flex items-center justify-center space-x-1 cursor-pointer transition-colors"
              >
                <span className="text-xs">
                  {isDetailsExpanded ? 'Hide Details' : 'Show More Details'}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className={`h-4 w-4 transform transition-transform duration-300 ${isDetailsExpanded ? 'rotate-180' : ''}`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25L12 15.75 4.5 8.25" />
                </svg>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </MainLayout>
  );
}