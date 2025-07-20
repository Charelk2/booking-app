import { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';

export function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

export async function getCroppedImage(
  imageSrc: string,
  pixelCrop: PixelCrop,
  fileName: string,
  outputWidth: number = 300,
  outputHeight: number = 300,
): Promise<File | null> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx || pixelCrop.width === 0 || pixelCrop.height === 0) {
    console.error('Failed to get 2D context or crop dims are zero.');
    return null;
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Canvas is empty or failed to create blob.');
        resolve(null);
        return;
      }
      const nameParts = fileName.split('.');
      if (nameParts.length > 1) nameParts.pop();
      const baseName = nameParts.join('.') || 'cropped_image';
      const finalFileName = `${baseName}.jpg`;
      const file = new File([blob], finalFileName, { type: 'image/jpeg' });
      resolve(file);
    }, 'image/jpeg', 0.85);
  });
}
