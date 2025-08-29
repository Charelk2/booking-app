'use client';

import { useState, useRef } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import { uploadMyProfilePicture } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { getFullImageUrl } from '@/lib/utils';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { centerAspectCrop, getCroppedImage } from '@/lib/imageCrop';
import imageCompression from 'browser-image-compression';

const ReactCrop = dynamic(() => import('react-image-crop').then((m) => m.ReactCrop), {
  ssr: false,
});

export default function ProfilePicturePage() {
  const { user, refreshUser } = useAuth();
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [fileName, setFileName] = useState('profile.jpg');
  const imgRef = useRef<HTMLImageElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setFileName(f.name);
    const url = URL.createObjectURL(f);
    setOriginalSrc(url);
    setPreview(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  const handleCropAndUpload = async () => {
    setError(null);
    setSuccess(null);
    if (!originalSrc || !completedCrop) {
      setError('Please choose and crop an image.');
      return;
    }
    setUploading(true);
    try {
      const cropped = await getCroppedImage(originalSrc, completedCrop, fileName);
      if (!cropped) throw new Error('Failed to crop image');
      // Compress the cropped image on the client before upload to save bandwidth
      const compressed = await imageCompression(cropped, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      });
      await uploadMyProfilePicture(compressed);
      setSuccess('Profile picture uploaded!');
      await refreshUser?.();
      setOriginalSrc(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
    } catch (err: unknown) {
      console.error('Failed to crop or upload profile picture:', err);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const currentUrl = user?.profile_picture_url
    ? (getFullImageUrl(user.profile_picture_url) as string)
    : null;

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setCrop(centerAspectCrop(naturalWidth, naturalHeight, 1));
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-sm py-10 space-y-4">
        <h1 className="text-2xl font-bold">Profile Picture</h1>
        {preview ? (
          <Image
            src={preview}
            alt="Preview"
            width={128}
            height={128}
            className="w-32 h-32 object-cover rounded-full"
            unoptimized
          />
        ) : currentUrl ? (
          <Image
            src={currentUrl}
            alt="Current profile"
            width={128}
            height={128}
            className="w-32 h-32 object-cover rounded-full"
          />
        ) : null}
        <div className="space-y-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleChange}
            data-testid="file-input"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-light file:text-brand-dark hover:file:bg-brand-light"
          />
          {originalSrc && (
            <div>
              <ReactCrop
                crop={crop}
                onChange={(_, c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
              >
                <Image
                  ref={imgRef}
                  src={originalSrc}
                  alt="Crop me"
                  onLoad={onImageLoad}
                  width={300}
                  height={300}
                  className="max-h-[300px] object-contain"
                  unoptimized
                />
              </ReactCrop>
              <Button
                type="button"
                onClick={handleCropAndUpload}
                disabled={uploading || !completedCrop?.width}
                isLoading={uploading}
                data-testid="crop-submit"
                className="mt-2"
              >
                Apply Crop & Upload
              </Button>
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
          {success && <p className="text-green-700">{success}</p>}
        </div>
      </div>
    </MainLayout>
  );
}
