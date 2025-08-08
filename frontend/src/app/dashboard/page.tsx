"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui";
import { getArtistProfileMe } from "@/lib/api";

export default function DashboardRedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/dashboard");
      return;
    }
    if (user.user_type === "service_provider") {
      (async () => {
        try {
          const profile = await getArtistProfileMe();
          if (!profile.data.service_category_id) {
            router.replace("/register/category");
          } else {
            router.replace("/dashboard/artist");
          }
        } catch (err) {
          console.error("Failed to fetch profile:", err);
          router.replace("/dashboard/artist");
        }
      })();
    } else {
      router.replace("/dashboard/client");
    }
  }, [user, loading, router]);

  return (
    <div className="p-8 flex justify-center"><Spinner /></div>
  );
}

