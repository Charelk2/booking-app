'use client';

import { useState, useEffect, useRef } from 'react';
import NextImage from 'next/image';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { MobileSaveBar } from '@/components/dashboard';
import { useAuth } from '@/contexts/AuthContext';
import { ServiceProviderProfile } from '@/types';
import {
  getServiceProviderProfileMe,
  updateMyServiceProviderProfile,
  uploadMyServiceProviderProfilePicture,
  uploadMyServiceProviderCoverPhoto,
  uploadMyServiceProviderPortfolioImages,
  updateMyServiceProviderPortfolioImageOrder,
  getGoogleCalendarStatus,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
} from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { Spinner } from '@/components/ui';
import LocationInput from '@/components/ui/LocationInput';
import MarkdownPreview from '@/components/ui/MarkdownPreview';

import dynamic from 'next/dynamic';
import {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const ReactCrop = dynamic(() => import('react-image-crop').then((m) => m.ReactCrop), {
  ssr: false,
});


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

export default function EditServiceProviderProfilePage(): JSX.Element {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Fetched profile
  const [profile, setProfile] = useState<Partial<ServiceProviderProfile>>({});

  // Business‐form fields
  const [businessNameInput, setBusinessNameInput] = useState('');
  const [customSubtitleInput, setCustomSubtitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [hourlyRateInput, setHourlyRateInput] = useState<string | number>('');
  const [specialtiesInput, setSpecialtiesInput] = useState('');
  const [portfolioUrlsInput, setPortfolioUrlsInput] = useState('');
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const dragIndex = useRef<number | null>(null);
  const [uploadingPortfolioImages, setUploadingPortfolioImages] = useState(false);

  // Profile Picture States
  const [profilePictureUrlInput, setProfilePictureUrlInput] = useState('');
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect] = useState<number | undefined>(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
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
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);

  // Policies wizard state
  const [policyTemplate, setPolicyTemplate] = useState<'flexible'|'moderate'|'strict'|'custom'>('flexible');
  const [cancellationPolicy, setCancellationPolicy] = useState<string>('');
  const POLICY_TEMPLATES: Record<string, string> = {
    flexible: '# Flexible\n\n- Free cancellation within 48 hours of booking.\n- 100% refund up to 14 days before the event.\n- 50% refund up to 7 days before.',
    moderate: '# Moderate\n\n- Free cancellation within 24 hours of booking.\n- 50% refund up to 7 days before the event.',
    strict: '# Strict\n\n- Non-refundable within 14 days of the event.\n- 50% refund before that period.',
    custom: '',
  };
  const POLICY_DESCRIPTIONS: Record<'flexible'|'moderate'|'strict'|'custom', string> = {
    flexible: 'Great for gigs with flexible schedules. Encourages bookings with generous refunds.',
    moderate: 'Balanced protection for both you and clients.',
    strict: 'Use for high-demand dates or complex events.',
    custom: 'Write your own terms (supports basic Markdown).',
  };

  const searchParams = useSearchParams();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user.user_type !== 'service_provider') {
      setError('Access denied. This page is for artists only.');
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await getServiceProviderProfileMe();
        const fetchedProfile = response.data || {};
        setProfile(fetchedProfile);

        // Initialize form inputs
        setBusinessNameInput(fetchedProfile.business_name || '');
        setCustomSubtitleInput(fetchedProfile.custom_subtitle || '');
        setDescriptionInput(fetchedProfile.description || '');
        setLocationInput(fetchedProfile.location || '');
        setHourlyRateInput(fetchedProfile.hourly_rate?.toString() || '');
        setSpecialtiesInput(fetchedProfile.specialties?.join(', ') || '');
        setPortfolioUrlsInput(fetchedProfile.portfolio_urls?.join(', ') || '');
        setPortfolioImages(fetchedProfile.portfolio_image_urls || []);
        setCancellationPolicy(fetchedProfile.cancellation_policy || '');

        const currentRelativePic = fetchedProfile.profile_picture_url || '';
        setProfilePictureUrlInput(currentRelativePic);
        setImagePreviewUrl(getFullImageUrl(currentRelativePic));

        setCoverPhotoUrl(getFullImageUrl(fetchedProfile.cover_photo_url));

        setShowCropper(false);
        setOriginalImageSrc(null);
        setCrop(undefined);
        setCompletedCrop(undefined);
      } catch (err) {
        console.error('Failed to fetch service provider profile:', err);
        setError('Failed to load your profile. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    const syncStatus = searchParams.get('calendarSync');
    if (syncStatus === 'success') {
      setSuccessMessage('Google Calendar connected successfully!');
      setCalendarConnected(true);
    } else if (syncStatus === 'error') {
      setError('Failed to connect Google Calendar.');
    }

    fetchProfile();
    getGoogleCalendarStatus()
      .then((res) => {
        setCalendarConnected(res.data.connected);
        setCalendarEmail(res.data.email || null);
      })
      .catch(() => {
        setCalendarConnected(false);
        setCalendarEmail(null);
      });
  }, [user, authLoading, router, pathname, searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!user || user.user_type !== 'service_provider') {
      setError('Action not allowed.');
      return;
    }

    if (!businessNameInput.trim()) {
      setError('Business name is required.');
      return;
    }

    if (!locationInput.trim()) {
      setError('Location is required.');
      return;
    }

    try {
      setLoading(true);
      const dataToUpdate: Partial<ServiceProviderProfile> = {
        business_name: businessNameInput.trim(),
        custom_subtitle: customSubtitleInput.trim() || undefined,
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
        portfolio_image_urls: portfolioImages,
        profile_picture_url: profilePictureUrlInput.trim()
          ? profilePictureUrlInput.trim()
          : undefined,
        cancellation_policy: cancellationPolicy.trim() || undefined,
      };

      await updateMyServiceProviderProfile(dataToUpdate);
      setSuccessMessage('Profile details updated successfully!');
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError('Failed to update profile details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClick = () => {
    formRef.current?.requestSubmit();
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

      const response = await uploadMyServiceProviderProfilePicture(croppedImageFile);
      const newRelativeUrl = response.data.profile_picture_url || '';
      setProfilePictureUrlInput(newRelativeUrl);
      setImagePreviewUrl(getFullImageUrl(newRelativeUrl));
      setProfile((prev) => ({ ...prev, profile_picture_url: newRelativeUrl }));
      await refreshUser?.();
      setSuccessMessage('Profile picture uploaded successfully!');
      setShowCropper(false);
      setOriginalImageSrc(null);
      setCompletedCrop(undefined);
    } catch (err: unknown) {
      console.error('Failed to crop or upload image:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to upload image.';
      setError(msg);
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
      const response = await uploadMyServiceProviderCoverPhoto(file);
      const newRelativeCoverUrl = response.data.cover_photo_url || '';
      setCoverPhotoUrl(getFullImageUrl(newRelativeCoverUrl));
      setProfile((prev) => ({ ...prev, cover_photo_url: newRelativeCoverUrl || undefined }));
      setCoverPhotoSuccessMessage('Cover photo uploaded successfully!');
    } catch (err: unknown) {
      console.error('Failed to upload cover photo:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to upload cover photo.';
      setCoverPhotoError(msg);
    } finally {
      setUploadingCoverPhoto(false);
      e.target.value = '';
    }
  };

  const handlePortfolioFilesChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPortfolioImages(true);
    try {
      const fileArray = Array.from(files);
      const response = await uploadMyServiceProviderPortfolioImages(fileArray);
      const urls = response.data.portfolio_image_urls || [];
      setPortfolioImages(urls);
      setProfile((prev) => ({ ...prev, portfolio_image_urls: urls }));
    } catch (err) {
      console.error('Failed to upload portfolio images:', err);
      setError('Failed to upload portfolio images.');
    } finally {
      setUploadingPortfolioImages(false);
      e.target.value = '';
    }
  };

  const handleDragStart = (index: number) => () => {
    dragIndex.current = index;
  };

  const handleDrop = (index: number) => async (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === index) return;
    setPortfolioImages((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(index, 0, moved);
      updateMyServiceProviderPortfolioImageOrder(arr).catch((err) => {
        console.error('Failed to update portfolio order:', err);
      });
      return arr;
    });
    dragIndex.current = null;
  };

  const handleConnectCalendar = async () => {
    try {
      const res = await connectGoogleCalendar();
      window.location.href = res.data.auth_url;
    } catch (err) {
      console.error('Failed to connect calendar:', err);
      setError('Failed to initiate Google Calendar sync.');
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      await disconnectGoogleCalendar();
      setCalendarConnected(false);
      setCalendarEmail(null);
    } catch (err) {
      console.error('Failed to disconnect calendar:', err);
      setError('Failed to disconnect Google Calendar.');
    }
  };

  const inputClasses =
    'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm placeholder-gray-400';
  const labelClasses = 'block text-sm font-medium text-gray-700 mb-1';
  const primaryButtonClasses =
    'inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-dark hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50';

  if (authLoading || loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-screen">
          <Spinner />
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

  if (user && user.user_type !== 'service_provider' && !authLoading) {
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
          Edit Your Service Provider Profile
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
                  <NextImage
                    src={imagePreviewUrl}
                    alt="Profile Preview"
                    width={128}
                    height={128}
                    loading="lazy"
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
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-light file:text-brand-dark hover:file:bg-brand-light"
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
                      <NextImage
                        ref={imgRef}
                        src={originalImageSrc}
                        alt="Crop me"
                        onLoad={onImageLoad}
                        width={300}
                        height={300}
                        loading="lazy"
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
                  <NextImage
                    src={coverPhotoUrl}
                    alt="Cover Photo Preview"
                    width={400}
                    height={192}
                    loading="lazy"
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
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-light file:text-brand-dark hover:file:bg-brand-light"
                  disabled={uploadingCoverPhoto}
                />
                {uploadingCoverPhoto && (
                  <p className="text-sm text-brand-dark">Uploading cover photo...</p>
                )}
                {coverPhotoError && <p className="text-sm text-red-600">{coverPhotoError}</p>}
                {coverPhotoSuccessMessage && (
                  <p className="text-sm text-green-600">{coverPhotoSuccessMessage}</p>
                )}
              </div>
            </div>
            {/* Portfolio Images */}
            <div className="space-y-4 md:col-span-2">
              <label htmlFor="portfolioImagesInput" className={labelClasses}>
                Portfolio Images
              </label>
              <input
                id="portfolioImagesInput"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePortfolioFilesChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-light file:text-brand-dark hover:file:bg-brand-light"
                disabled={uploadingPortfolioImages}
              />
              {uploadingPortfolioImages && (
                <p className="text-sm text-brand-dark">Uploading images...</p>
              )}
              {portfolioImages.length > 0 && (
                <ul className="grid grid-cols-3 gap-3" data-testid="portfolio-list">
                  {portfolioImages.map((url, idx) => (
                    <li
                      key={url}
                      data-testid="portfolio-item"
                      draggable
                      onDragStart={handleDragStart(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop(idx)}
                      className="border rounded-md overflow-hidden cursor-move"
                    >
                      <NextImage
                        src={getFullImageUrl(url)}
                        alt={`Portfolio ${idx + 1}`}
                        width={120}
                        height={120}
                        className="w-full h-24 object-cover"
                        loading="lazy"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-8 divide-y divide-gray-200"
        >
          <div className="space-y-6 pt-8 sm:space-y-5">
            <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
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
                  <label htmlFor="customSubtitle" className={labelClasses}>
                    Subtitle / Tagline
                  </label>
                  <input
                    type="text"
                    id="customSubtitle"
                    value={customSubtitleInput}
                    onChange={(e) => setCustomSubtitleInput(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., Indie Rock Band"
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
                  <LocationInput
                    value={locationInput}
                    onValueChange={setLocationInput}
                    onPlaceSelect={() => {}}
                    placeholder="e.g., City, State or Studio Address"
                    inputClassName={inputClasses}
                    required
                  />
                </div>
              </div>
            </section>

            {/* Policies Wizard */}
            <section className="pt-8 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-xl font-medium text-gray-700 mb-3">Policies</h2>
              <p className="text-sm text-gray-600 mb-4">Set a cancellation policy clients will see before they book.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {(['flexible','moderate','strict','custom'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setPolicyTemplate(t);
                      if (t !== 'custom') setCancellationPolicy(POLICY_TEMPLATES[t]);
                    }}
                    className={`px-3 py-2 rounded-md border text-sm ${policyTemplate===t ? 'border-gray-800 text-gray-900' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    aria-pressed={policyTemplate===t}
                  >
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mb-3">{POLICY_DESCRIPTIONS[policyTemplate]}</p>
              <div className="space-y-2">
                <label htmlFor="cancellationPolicy" className={labelClasses}>Cancellation policy text</label>
                <textarea
                  id="cancellationPolicy"
                  value={cancellationPolicy}
                  onChange={(e)=>{ setCancellationPolicy(e.target.value); setPolicyTemplate('custom'); }}
                  rows={5}
                  className={inputClasses}
                  placeholder="Write your policy here..."
                />
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Live preview</span>
                  <span>{cancellationPolicy.length} chars</span>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  {cancellationPolicy.trim() ? (
                    <MarkdownPreview value={cancellationPolicy} />
                  ) : (
                    <span>No policy yet. Choose a template or write your own.</span>
                  )}
                </div>
                <div className="pt-2">
                  <button type="submit" className={primaryButtonClasses}>Save & Preview</button>
                </div>
              </div>
            </section>

            <section className="pt-8 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-xl font-medium text-gray-700 mb-6">Professional Details</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="hourlyRate" className={labelClasses}>
                    {`Hourly Rate (${DEFAULT_CURRENCY})`}
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

            <section className="pt-8 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-xl font-medium text-gray-700 mb-6">Sync Google Calendar</h2>
              <p className="text-sm text-gray-600 mb-4">
                Status:
                {calendarConnected
                  ? ` Connected${calendarEmail ? ` - ${calendarEmail}` : ''}`
                  : ' Not connected'}
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleConnectCalendar}
                  className={primaryButtonClasses}
                  disabled={calendarConnected}
                >
                  Connect
                </button>
                {calendarConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectCalendar}
                    className={primaryButtonClasses}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </section>
          </div>

          <div className="pt-8 hidden sm:flex justify-end">
            <button
              type="submit"
              className={primaryButtonClasses}
              disabled={
                loading ||
                uploadingImage ||
                uploadingCoverPhoto ||
                uploadingPortfolioImages
              }
            >
              {loading ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
      <MobileSaveBar
        onSave={handleSaveClick}
        isSaving={
          loading ||
          uploadingImage ||
          uploadingCoverPhoto ||
          uploadingPortfolioImages
        }
      />
    </MainLayout>
  );
}
