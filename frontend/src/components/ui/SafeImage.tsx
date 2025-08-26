"use client";

import Image, { ImageProps } from "next/image";
import { useEffect, useMemo, useState } from "react";
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
  const defaultFallback = useMemo(
    () => (fallbackSrc ?? (getFullImageUrl('/static/default-avatar.svg') as string)),
    [fallbackSrc],
  );

  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src || undefined);
  const [triedAlternate, setTriedAlternate] = useState(false);
  const [triedCaseVariant, setTriedCaseVariant] = useState(false);
  const [failedHard, setFailedHard] = useState(false);

  // Reset when src changes
  useEffect(() => {
    setCurrentSrc(src || undefined);
    setTriedAlternate(false);
    setTriedCaseVariant(false);
    setFailedHard(false);
  }, [src]);

  const onError = () => {
    if (!currentSrc) {
      setFailedHard(true);
      return;
    }
    if (triedAlternate && triedCaseVariant) {
      setFailedHard(true);
      return;
    }
    // Try Booka-specific alternate path toggles between /static and direct mount
    try {
      const u = new URL(currentSrc, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const isBookaHost = /(^|\.)booka\.co\.za$/i.test(u.hostname);
      const toggled = (() => {
        // toggle /static/<mount>/... <-> /<mount>/...
        const mStatic = u.pathname.match(/^\/static\/(profile_pics|cover_photos|portfolio_images|attachments)\/(.*)$/i);
        if (mStatic) return `${u.protocol}//${u.host}/${mStatic[1]}/${mStatic[2]}${u.search}`;
        const mDirect = u.pathname.match(/^\/(profile_pics|cover_photos|portfolio_images|attachments)\/(.*)$/i);
        if (mDirect) return `${u.protocol}//${u.host}/static/${mDirect[1]}/${mDirect[2]}${u.search}`;
        return null;
      })();
      if (isBookaHost && toggled && !triedAlternate) {
        setTriedAlternate(true);
        setCurrentSrc(toggled);
        return;
      }
      // Try case-variant of the extension (.JPG <-> .jpg)
      if (isBookaHost && !triedCaseVariant) {
        const dot = u.pathname.lastIndexOf('.');
        if (dot !== -1) {
          const base = u.pathname.slice(0, dot);
          const ext = u.pathname.slice(dot); // includes dot
          // Only toggle case of known image extensions
          if (/\.(png|jpg|jpeg|webp|gif|svg|avif)(\?|$)/i.test(ext)) {
            const flipped = /[A-Z]/.test(ext) ? ext.toLowerCase() : ext.toUpperCase();
            const nextUrl = `${u.protocol}//${u.host}${base}${flipped}${u.search}`;
            setTriedCaseVariant(true);
            setCurrentSrc(nextUrl);
            return;
          }
        }
      }
    } catch {
      // ignore
    }
    setFailedHard(true);
  };

  const effectiveSrc = failedHard ? defaultFallback : (currentSrc || defaultFallback);

  return (
    <Image
      {...rest}
      alt={alt}
      src={effectiveSrc}
      onError={onError}
    />
  );
}
