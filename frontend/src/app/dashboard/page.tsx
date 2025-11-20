"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui";

export default function DashboardRedirectPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const triedRefreshRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    // After external auth (Google, magic link, etc.), we may have a fresh
    // cookie-based session but no stored user yet. Probe /auth/me once via
    // refreshUser before treating this as an anonymous visit.
    if (!user && !triedRefreshRef.current) {
      triedRefreshRef.current = true;
      if (refreshUser) {
        void refreshUser();
      }
      return;
    }

    if (!user) {
      router.replace("/auth?intent=login&next=/dashboard");
      return;
    }
    if (user.user_type === "service_provider") {
      router.replace("/dashboard/artist");
    } else {
      router.replace("/dashboard/client");
    }
  }, [user, loading, router, refreshUser]);

  return (
    <div className="p-8 flex justify-center"><Spinner /></div>
  );
}
