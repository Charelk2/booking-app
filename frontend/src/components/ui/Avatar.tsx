"use client";
import Image from "next/image";

interface AvatarProps {
  profileUrl?: string;
  size?: number;
  alt?: string;
}

export default function Avatar({
  profileUrl,
  size = 48,
  alt = "avatar",
}: AvatarProps) {
  const src = profileUrl
    ? `${process.env.NEXT_PUBLIC_API_URL}/static/profile_pics/${profileUrl}`
    : "/static/default-avatar.svg";

  return (
    <Image
      src={src}
      width={size}
      height={size}
      className="object-cover rounded-full"
      alt={alt}
    />
  );
}
