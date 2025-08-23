"use client";

import { useParams } from "next/navigation";
import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import { VideoChatBrief } from "@/components/booking/bookinwizardpersonilsedvideo";

export default function VideoOrderBriefPage() {
  const params = useParams();
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) return <MainLayout><div className="p-6 text-red-600">Invalid order id</div></MainLayout>;
  return (
    <MainLayout>
      <VideoChatBrief orderId={id} />
    </MainLayout>
  );
}

