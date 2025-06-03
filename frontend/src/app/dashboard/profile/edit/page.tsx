'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { ArtistProfile } from '@/types';
import {
  getArtistProfileMe,
  updateMyArtistProfile,
  uploadMyArtistProfilePicture,
  uploadMyArtistCoverPhoto,
} from '@/lib/api';
import { getFullImageUrl, extractErrorMessage } from '@/lib/utils';

import {
  ReactCrop,
  centerCrop,
  makeAspectCrop,
  Crop,
  PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';


// Helper function to generate a centered aspect‐ratio crop
function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

// Helper to turn a PixelCrop + dataURL into a JPEG File
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
  fileName: string,
  outputWidth: number = 300,
  outputHeight: number = 300
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
    outputHeight
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

export default function EditArtistProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Fetched profile
  const [profile, setProfile] = useState<Partial<ArtistProfile>>({});

  // Business‐form fields
  const [businessNameInput, setBusinessNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [hourlyRateInput, setHourlyRateInput] = useState<string | number>('');
  const [specialtiesInput, setSpecialtiesInput] = useState('');
  const [portfolioUrlsInput, setPortfolioUrlsInput] = useState('');

  // Profile Picture States
  const [profilePictureUrlInput, setProfilePictureUrlInput] = useState('');
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect] = useState<number | undefined>(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [originalFileName, setOriginalFileName] = useState('cropped_image.png');

  // Cover Photo States
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const [uploadingCoverPhoto, setUploadingCoverPhoto] = useState(false);
  const [coverPhotoError, setCoverPhotoError] = useState<string | null>(null);
  const [coverPhotoSuccessMessage, setCoverPhotoSuccessMessage] = useState<string | null>(null);

  // Misc UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.user_type !== 'artist') {
      setError('Access denied. This page is for artists only.');
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await getArtistProfileMe();
        const fetchedProfile = response.data || {};
        setProfile(fetchedProfile);

        // Initialize form inputs
        setBusinessNameInput(fetchedProfile.business_name || '');
        setDescriptionInput(fetchedProfile.description || '');
        setLocationInput(fetchedProfile.location || '');
        setHourlyRateInput(fetchedProfile.hourly_rate?.toString() || '');
        setSpecialtiesInput(fetchedProfile.specialties?.join(', ') || '');
        setPortfolioUrlsInput(fetchedProfile.portfolio_urls?.join(', ') || '');

        const currentRelativePic = fetchedProfile.profile_picture_url || '';
        setProfilePictureUrlInput(currentRelativePic);
        setImagePreviewUrl(getFullImageUrl(currentRelativePic));

        setCoverPhotoUrl(getFullImageUrl(fetchedProfile.cover_photo_url));

        setShowCropper(false);
        setOriginalImageSrc(null);
        setCrop(undefined);
        setCompletedCrop(undefined);
      } catch (err) {
        console.error('Failed to fetch artist profile:', err);
        setError('Failed to load your profile. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!user || user.user_type !== 'artist') {
      setError('Action not allowed.');
      return;
    }

    if (!businessNameInput.trim()) {
      setError('Business name is required.');
      return;
    }

    try {
      setLoading(true);
      const dataToUpdate: Partial<ArtistProfile> = {
        business_name: businessNameInput.trim(),
        description: descriptionInput.trim(),
        location: locationInput.trim(),
        hourly_rate: hourlyRateInput
          ? parseFloat(String(hourlyRateInput))
          : undefined,
        specialties: specialtiesInput
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s),
        portfolio_urls: portfolioUrlsInput
          .split(',')
          .map((u) => u.trim())
          .filter((u) => u)
          .map((u) =>
            u.startsWith('http://') || u.startsWith('https://')
              ? u
              : `http://${u}`
          ),
        profile_picture_url: profilePictureUrlInput.trim()
          ? profilePictureUrlInput.trim()
          : undefined,
      };

      await updateMyArtistProfile(dataToUpdate);
      setSuccessMessage('Profile details updated successfully!');
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError('Failed to update profile details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMessage(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOriginalFileName(file.name);
      setCrop(undefined);
      setCompletedCrop(undefined);
      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginalImageSrc(reader.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    } else {
      setOriginalImageSrc(null);
      setShowCropper(false);
      setImagePreviewUrl(getFullImageUrl(profilePictureUrlInput));
    }
    e.target.value = '';
  };

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (aspect) {
      const { naturalWidth, naturalHeight } = e.currentTarget;
      if (naturalWidth > 0 && naturalHeight > 0) {
        const newCrop = centerAspectCrop(naturalWidth, naturalHeight, aspect);
        setCrop(newCrop);
      } else {
        setError('Could not read image dimensions. Please try a different image.');
      }
    }
  }

  const handleCropAndUpload = async () => {
    const MIN_CROP_DIMENSION = 300;
    if (!completedCrop || !originalImageSrc || !imgRef.current) {
      setError("Please select and crop an image first.");
      setUploadingImage(false);
      return;
    }

    if (
      completedCrop.width < MIN_CROP_DIMENSION ||
      completedCrop.height < MIN_CROP_DIMENSION
    ) {
      setError(
        `Please select a larger crop area (minimum ${MIN_CROP_DIMENSION}×${MIN_CROP_DIMENSION} pixels).`
      );
      setUploadingImage(false);
      return;
    }

    setUploadingImage(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const croppedImageFile = await getCroppedImg(
        originalImageSrc,
        completedCrop,
        originalFileName,
        300,
        300
      );

      if (!croppedImageFile) {
        setError('Failed to crop image. Try a different image.');
        setUploadingImage(false);
        return;
      }

      const response = await uploadMyArtistProfilePicture(croppedImageFile);
      const newRelativeUrl = response.data.profile_picture_url || '';
      setProfilePictureUrlInput(newRelativeUrl);
      setImagePreviewUrl(getFullImageUrl(newRelativeUrl));
      setProfile((prev) => ({ ...prev, profile_picture_url: newRelativeUrl }));
      setSuccessMessage('Profile picture uploaded successfully!');
      setShowCropper(false);
      setOriginalImageSrc(null);
      setCompletedCrop(undefined);
    } catch (err: any) {
      console.error('Failed to crop or upload image:', err);
      if (err.response?.data?.detail) {
        setError(extractErrorMessage(err.response.data.detail));
      } else {
        const msg = err.message || 'Failed to upload image.';
        setError(msg);
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCoverPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setCoverPhotoError(null);
    setCoverPhotoSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCoverPhoto(true);

    try {
      const response = await uploadMyArtistCoverPhoto(file);
      const newRelativeCoverUrl = response.data.cover_photo_url || '';
      setCoverPhotoUrl(getFullImageUrl(newRelativeCoverUrl));
      setProfile((prev) => ({ ...prev, cover_photo_url: newRelativeCoverUrl || undefined }));
      setCoverPhotoSuccessMessage('Cover photo uploaded successfully!');
    } catch (err: any) {
      console.error('Failed to upload cover photo:', err);
      if (err.response?.data?.detail) {
        setCoverPhotoError(extractErrorMessage(err.response.data.detail));
      } else {
        const msg = err.message || 'Failed to upload cover photo.';
        setCoverPhotoError(msg);
      }
    } finally {
      setUploadingCoverPhoto(false);
      e.target.value = '';
    }
  };

  const inputClasses =
    'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm placeholder-gray-400';
  const labelClasses = 'block text-sm font-medium text-gray-700 mb-1';
  const primaryButtonClasses =
    'inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50';

  if (authLoading || loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-screen">
          <p>Loading...</p>
        </div>
      </MainLayout>
    );
  }

  if (error && !profile) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-screen">
          <p className="text-red-500">{error}</p>
        </div>
      </MainLayout>
    );
  }

  if (user && user.user_type !== 'artist' && !authLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <p className="text-red-500 text-center">Access denied. This page is for artists only.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-white shadow-lg rounded-lg my-10">
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-800 mb-8 border-b pb-4">
          Edit Your Artist Profile
        </h1>

        {error && <p className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded-md">{error}</p>}
        {successMessage && <p className="mb-4 text-sm text-green-600 bg-green-100 p-3 rounded-md">{successMessage}</p>}

        {/* Profile Media Section */}
        <section className="mb-10">
          <h2 className="text-xl font-medium text-gray-700 mb-6">Profile Media</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Profile Picture Upload */}
            <div className="space-y-4">
              <label htmlFor="profilePicInput" className={labelClasses}>
                Profile Picture
              </label>
              <div className="flex flex-col items-center space-y-3">
                {imagePreviewUrl ? (
                  <img
                    src={imagePreviewUrl}
                    alt="Profile Preview"
                    className="w-32 h-32 rounded-full object-cover border-2 border-gray-300 shadow-sm"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm border-2 border-gray-300 shadow-sm">
                    No Photo
                  </div>
                )}

                <input
                  id="profilePicInput"
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              {showCropper && originalImageSrc && (
                <div className="mt-4 p-4 border rounded-md bg-gray-50">
                  <h3 className="text-md font-medium text-gray-700 mb-2">Crop Your Photo</h3>
                  <div style={{ width: '100%', height: 300, position: 'relative' }}>
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      onComplete={(c: PixelCrop) => {
                        if (
                          imgRef.current &&
                          c.width &&
                          c.height &&
                          imgRef.current.naturalWidth > 0 &&
                          imgRef.current.naturalHeight > 0
                        ) {
                          const image = imgRef.current;
                          const scaleX = image.naturalWidth / image.width;
                          const scaleY = image.naturalHeight / image.height;
                          const scaledCrop: PixelCrop = {
                            x: Math.round(c.x * scaleX),
                            y: Math.round(c.y * scaleY),
                            width: Math.round(c.width * scaleX),
                            height: Math.round(c.height * scaleY),
                            unit: 'px',
                          };
                          setCompletedCrop(scaledCrop);
                        } else {
                          setCompletedCrop(c);
                        }
                      }}
                      aspect={aspect}
                      circularCrop
                      minWidth={100}
                      minHeight={100}
                    >
                      <img
                        ref={imgRef}
                        src={originalImageSrc}
                        alt="Crop me"
                        onLoad={onImageLoad}
                        style={{ maxHeight: '300px', objectFit: 'contain' }}
                      />
                    </ReactCrop>
                  </div>
                  <button
                    type="button"
                    onClick={handleCropAndUpload}
                    className={`${primaryButtonClasses} mt-4 w-full`}
                    disabled={uploadingImage || !completedCrop?.width}
                  >
                    {uploadingImage ? 'Uploading...' : 'Apply Crop & Upload'}
                  </button>
                </div>
              )}
            </div>

            {/* Cover Photo Upload */}
            <div className="space-y-4">
              <label htmlFor="coverPhotoInput" className={labelClasses}>
                Cover Photo
              </label>
              <div className="flex flex-col items-center space-y-3">
                {coverPhotoUrl ? (
                  <img
                    src={coverPhotoUrl}
                    alt="Cover Photo Preview"
                    className="w-full h-48 object-cover rounded-md border-2 border-gray-300 shadow-sm"
                  />
                ) : (
                  <div className="w-full h-48 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-sm border-2 border-gray-300 shadow-sm">
                    No Cover Photo
                  </div>
                )}

                <input
                  id="coverPhotoInput"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverPhotoFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  disabled={uploadingCoverPhoto}
                />
                {uploadingCoverPhoto && (
                  <p className="text-sm text-indigo-600">Uploading cover photo...</p>
                )}
                {coverPhotoError && <p className="text-sm text-red-600">{coverPhotoError}</p>}
                {coverPhotoSuccessMessage && (
                  <p className="text-sm text-green-600">{coverPhotoSuccessMessage}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-8 divide-y divide-gray-200">
          <div className="space-y-6 pt-8 sm:space-y-5">
            <section>
              <h2 className="text-xl font-medium text-gray-700 mb-6">Business Details</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="businessName" className={labelClasses}>
                    Business Name *
                  </label>
                  <input
                    type="text"
                    id="businessName"
                    value={businessNameInput}
                    onChange={(e) => setBusinessNameInput(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., Your Awesome Studio"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="description" className={labelClasses}>
                    Bio / Description
                  </label>
                  <textarea
                    id="description"
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    rows={6}
                    className={inputClasses}
                    placeholder="Tell us about yourself, your art, and your services..."
                  />
                </div>
                <div>
                  <label htmlFor="location" className={labelClasses}>
                    Location
                  </label>
                  <input
                    type="text"
                    id="location"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., City, State or Studio Address"
                  />
                </div>
              </div>
            </section>

            <section className="pt-8">
              <h2 className="text-xl font-medium text-gray-700 mb-6">Professional Details</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="hourlyRate" className={labelClasses}>
                    Hourly Rate (USD)
                  </label>
                  <input
                    type="number"
                    id="hourlyRate"
                    value={hourlyRateInput}
                    onChange={(e) => setHourlyRateInput(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., 50"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label htmlFor="specialties" className={labelClasses}>
                    Specialties (comma-separated)
                  </label>
                  <input
                    type="text"
                    id="specialties"
                    value={specialtiesInput}
                    onChange={(e) => setSpecialtiesInput(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., Portraits, Landscapes, Events"
                  />
                </div>
                <div>
                  <label htmlFor="portfolioUrls" className={labelClasses}>
                    Portfolio URLs (comma-separated)
                  </label>
                  <input
                    type="text"
                    id="portfolioUrls"
                    value={portfolioUrlsInput}
                    onChange={(e) => setPortfolioUrlsInput(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., https://myportfolio.com, https://instagram.com/me"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="pt-8 flex justify-end">
            <button
              type="submit"
              className={primaryButtonClasses}
              disabled={loading || uploadingImage || uploadingCoverPhoto}
            >
              {loading ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
