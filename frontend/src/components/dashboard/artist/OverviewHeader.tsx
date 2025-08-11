"use client";
import React from "react";
import { Button } from "@/components/ui";
import { ProfileProgress } from "@/components/dashboard";
import type { ServiceProviderProfile, User } from "@/types";

type Props = {
  user: User;
  profile: ServiceProviderProfile | null;
  onAddService: () => void;
};

const OverviewHeader: React.FC<Props> = ({ user, profile, onAddService }) => {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Welcome back, {user.first_name || "User"}</h1>
        <p className="text-sm text-gray-500">Manage your requests, bookings, and services in one place.</p>
      </div>
      {user?.user_type === "service_provider" && profile && (
        <div className="mt-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="w-full md:w-1/2">
            <ProfileProgress profile={profile} />
          </div>
          <Button type="button" onClick={onAddService} className="w-full md:w-auto">
            Add New Service
          </Button>
        </div>
      )}
    </section>
  );
};

export default OverviewHeader;
