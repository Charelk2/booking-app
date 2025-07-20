'use client';

import { useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import { uploadMyProfilePicture } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { getFullImageUrl } from '@/lib/utils';

export default function ProfilePicturePage() {
  const { user, refreshUser } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!file) {
      setError('Please choose an image.');
      return;
    }
    setUploading(true);
    try {
      await uploadMyProfilePicture(file);
      setSuccess('Profile picture uploaded!');
      await refreshUser?.();
      setFile(null);
    } catch (err: unknown) {
      console.error('Failed to upload profile picture:', err);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const currentUrl = user?.profile_picture_url
    ? (getFullImageUrl(user.profile_picture_url) as string)
    : null;

  return (
    <MainLayout>
      <div className="mx-auto max-w-sm py-10 space-y-4">
        <h1 className="text-2xl font-bold">Profile Picture</h1>
        {preview ? (
          <img
            src={preview}
            alt="Preview"
            className="w-32 h-32 object-cover rounded-full"
          />
        ) : currentUrl ? (
          <img
            src={currentUrl}
            alt="Current profile"
            className="w-32 h-32 object-cover rounded-full"
          />
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleChange}
            data-testid="file-input"
          />
          {error && <p className="text-red-600">{error}</p>}
          {success && <p className="text-green-700">{success}</p>}
          <Button type="submit" disabled={uploading} isLoading={uploading}>
            Upload
          </Button>
        </form>
      </div>
    </MainLayout>
  );
}
