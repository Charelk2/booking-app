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
  const unoptimized = isDataOrBlob(url);

  const imgProps: ImageProps = {
    ...(rest as ImageProps),
    src: url,
    alt,
    unoptimized,
  } as ImageProps;

  return <Image {...imgProps} {...(isCfLoaderEnabled ? { loader: cfLoader } : {})} />;
}

