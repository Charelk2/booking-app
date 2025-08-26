"use client";

import Image, { ImageProps } from "next/image";
import { useState, useMemo } from "react";
import { getFullImageUrl } from "@/lib/utils";

type Props = Omit<ImageProps, "src"> & {
  src?: string | null;
  fallbackSrc?: string;
};

// A thin wrapper over next/image that swaps to a safe fallback
// when the primary source fails to load. Mirrors the simple usage
// in the CategoriesCarousel (fill + sizes) while guarding against
// malformed/temporary image URLs from the backend.
export default function SafeImage({ src, alt, fallbackSrc, ...rest }: Props) {
  const [failed, setFailed] = useState(false);

  const effectiveSrc = useMemo(() => {
    if (!src || failed) return (fallbackSrc ?? getFullImageUrl('/static/default-avatar.svg')) as string;
    return src;
  }, [src, failed, fallbackSrc]);

  return (
    <Image
      // next.config.js sets images.unoptimized=true globally; no need to pass here
      {...rest}
      alt={alt}
      src={effectiveSrc as string}
      onError={() => setFailed(true)}
    />
  );
}

