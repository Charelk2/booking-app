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
      router.replace("/login?next=/dashboard");
      return;
    }
    if (user.user_type === "artist") {
      router.replace("/dashboard/artist");
    } else {
      router.replace("/dashboard/client");
    }
  }, [user, loading, router]);

  return (
    <div className="p-8 flex justify-center"><Spinner /></div>
  );
}

