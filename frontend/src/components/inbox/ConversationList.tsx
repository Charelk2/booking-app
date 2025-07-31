"use client";

import clsx from "clsx";
import Image from "next/image";
import { format } from "date-fns";
import { BookingRequest, User } from "@/types";

interface ConversationListProps {
  bookingRequests: BookingRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (id: number) => void;
  currentUser: User | null;
}

export default function ConversationList({
  bookingRequests,
  selectedRequestId,
  onSelectRequest,
  currentUser,
}: ConversationListProps) {
  return (
    <div className="divide-y divide-gray-100">
      {bookingRequests.map((req) => {
        const isActive = selectedRequestId === req.id;
        const userType = currentUser?.user_type;
        const otherName =
          userType === "artist"
            ? req.client?.first_name || "Client"
            : req.artist?.first_name || "Artist";
        const avatarUrl =
          userType === "artist"
            ? req.client?.profile_picture_url
            : req.artist?.profile_picture_url;
        const date = req.updated_at || req.created_at;
        return (
          <div
            key={req.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectRequest(req.id)}
            onKeyPress={() => onSelectRequest(req.id)}
            className={clsx(
              "flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50",
              isActive && "bg-gray-100",
            )}
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="avatar"
                width={40}
                height={40}
                className="flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 font-medium text-white">
                {otherName.charAt(0)}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <div
                className={clsx(
                  "flex items-center justify-between",
                  req.is_unread_by_current_user && "font-semibold",
                )}
              >
                <span className="truncate">{otherName}</span>
                <time
                  dateTime={date}
                  className="flex-shrink-0 text-xs text-gray-500"
                >
                  {format(new Date(date), "MMM d, yyyy")}
                </time>
              </div>
              <div
                className={clsx(
                  "truncate text-xs text-gray-600",
                  req.is_unread_by_current_user && "font-semibold",
                )}
              >
                {req.last_message_content ??
                  req.service?.title ??
                  req.message ??
                  "New Request"}
              </div>
            </div>
            {req.is_unread_by_current_user && (
              <span className="h-2 w-2 rounded-full bg-red-600" />
            )}
          </div>
        );
      })}
    </div>
  );
}
