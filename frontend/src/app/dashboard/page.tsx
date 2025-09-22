"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui";

export default function DashboardRedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth?intent=login&next=/dashboard");
      return;
    }
    if (user.user_type === "service_provider") {
      router.replace("/dashboard/artist");
    } else {
      router.replace("/dashboard/client");
    }
  }, [user, loading, router]);

  return (
    <div className="p-8 flex justify-center"><Spinner /></div>
  );
}
