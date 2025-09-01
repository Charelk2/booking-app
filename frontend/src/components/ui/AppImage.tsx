"use client";

import Image, { ImageProps } from 'next/image';
import { toCanonicalImageUrl, isDataOrBlob } from '@/lib/images';
import { cfLoader, isCfLoaderEnabled } from '@/lib/cfLoader';

type Props = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null;
  alt?: string; // allow empty alt for decorative
};

export default function AppImage({ src, alt = '', ...rest }: Props) {
  const url = toCanonicalImageUrl(src) || '/static/default-avatar.svg';
  // Force direct loads for absolute reliability across devices.
  // This bypasses Next's optimizer (no /_next/image) so mobile and web fetch the same URL.
  const imgProps: ImageProps = {
    ...(rest as ImageProps),
    src: url,
    alt,
    unoptimized: true,
  } as ImageProps;

  return <Image {...imgProps} />;
}
