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
import { presignMyAvatar, presignMyCoverPhoto, presignMyPortfolioImage } from '@/lib/api';
import { getFullImageUrl, normalizeAssetPathForStorage } from '@/lib/utils';
import { Spinner, ImagePreviewModal } from '@/components/ui';
import SavedPill from '@/components/ui/SavedPill';
import useSavedHint from '@/hooks/useSavedHint';
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

// Normalize a ReactCrop crop to natural-image pixel coordinates
function toPixelCrop(img: HTMLImageElement, crop: any): PixelCrop {
  const naturalW = img.naturalWidth || 0;
  const naturalH = img.naturalHeight || 0;
  if (!crop) return { x: 0, y: 0, width: naturalW, height: naturalH, unit: 'px' } as any;
  // Percent unit
  if (typeof crop.unit === 'string' && crop.unit !== 'px') {
    return {
      x: Math.round(((crop.x || 0) / 100) * naturalW),
      y: Math.round(((crop.y || 0) / 100) * naturalH),
      width: Math.round(((crop.width || 0) / 100) * naturalW),
      height: Math.round(((crop.height || 0) / 100) * naturalH),
      unit: 'px',
    } as any;
  }
  // Pixel unit but relative to displayed size → scale to natural
  const rect = img.getBoundingClientRect();
  const scaleX = rect.width ? naturalW / rect.width : 1;
  const scaleY = rect.height ? naturalH / rect.height : 1;
  return {
    x: Math.round((crop.x || 0) * scaleX),
    y: Math.round((crop.y || 0) * scaleY),
    width: Math.round((crop.width || 0) * scaleX),
    height: Math.round((crop.height || 0) * scaleY),
    unit: 'px',
  } as any;
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
  // Contact details (sent to clients on confirmation)
  const [contactEmailInput, setContactEmailInput] = useState('');
  const [contactPhoneInput, setContactPhoneInput] = useState('');
  const [contactWebsiteInput, setContactWebsiteInput] = useState('');
  // Banking details (for payouts/invoices if needed)
  const [bankNameInput, setBankNameInput] = useState('');
  const [bankAccountNameInput, setBankAccountNameInput] = useState('');
  const [bankAccountNumberInput, setBankAccountNumberInput] = useState('');
  const [bankBranchCodeInput, setBankBranchCodeInput] = useState('');
  // Business & VAT details (agent invoicing)
  const [legalNameInput, setLegalNameInput] = useState('');
  const [vatRegisteredInput, setVatRegisteredInput] = useState(false);
  const [vatNumberInput, setVatNumberInput] = useState('');
  const [vatRateInput, setVatRateInput] = useState('15.0');
  const [invoiceEmailInput, setInvoiceEmailInput] = useState('');
  const [agentConsentInput, setAgentConsentInput] = useState(false);
  const [specialtiesInput, setSpecialtiesInput] = useState('');
  const [portfolioUrlsInput, setPortfolioUrlsInput] = useState('');
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  // Portfolio preview modal state
  const [portfolioPreviewOpen, setPortfolioPreviewOpen] = useState(false);
  const [portfolioPreviewIndex, setPortfolioPreviewIndex] = useState(0);
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
  const [coverOriginalSrc, setCoverOriginalSrc] = useState<string | null>(null);
  const coverImgRef = useRef<HTMLImageElement>(null);
  const [coverCrop, setCoverCrop] = useState<Crop>();
  const [coverCompletedCrop, setCoverCompletedCrop] = useState<PixelCrop>();
  const COVER_ASPECT = 16 / 9;

  // Misc UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [calendarCardMessage, setCalendarCardMessage] = useState<string | null>(null);
  // CTA variant for success after calendar sync
  const [ctaVariant, setCtaVariant] = useState<'generic' | 'calendar_success'>('generic');
  const justSyncedRef = useRef(false);

  // First-time completion CTA state
  const [showFirstTimeCompleteCta, setShowFirstTimeCompleteCta] = useState(false);

  // Policies wizard state
  const [policyTemplate, setPolicyTemplate] = useState<'flexible'|'moderate'|'strict'|'custom'>('flexible');
  const [cancellationPolicy, setCancellationPolicy] = useState<string>('');
  // Saved hints per card
  const bizHint = useSavedHint();
  const policyHint = useSavedHint();
  const profHint = useSavedHint();
  const contactHint = useSavedHint();
  const mediaHint = useSavedHint();
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const contactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bizTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const policyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // South Africa format only: +27 followed by 9 digits
  const isValidZANumber = (v: string) => /^\+27\d{9}$/.test(v.trim());
  const [phoneRest, setPhoneRest] = useState<string>('');
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

  // Basic validators for first-time completeness check
  const isValidEmail = (v: string) => /.+@.+\..+/.test((v || '').trim());
  const isLikelyUrl = (v: string) => /^(https?:\/\/)?[\w.-]+\.[A-Za-z]{2,}/.test((v || '').trim());

  // Determine if all required profile fields are filled for first-time completion
  const isProfileComplete = (() => {
    const hasBusiness = !!businessNameInput.trim();
    const hasDesc = !!descriptionInput.trim();
    const hasLocation = !!locationInput.trim();
    const hasEmail = isValidEmail(contactEmailInput);
    const hasPhone = isValidZANumber(contactPhoneInput);
    const hasWebsite = !!contactWebsiteInput.trim() && isLikelyUrl(contactWebsiteInput);
    const hasSpecialties = !!specialtiesInput.trim();
    // Policy is optional for completion (backend treats missing policy as OK)
    const hasPolicy = true;
    // Bank details are explicitly excluded from completion rules.
    return (
      hasBusiness && hasDesc && hasLocation && hasEmail && hasPhone && hasWebsite && hasSpecialties && hasPolicy && calendarConnected
    );
  })();

  // Show CTA only the first time profile becomes complete for this user (service providers only)
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.user_type !== 'service_provider') return;
    try {
      const key = `sp:onboard:complete:${user.id}`;
      const already = localStorage.getItem(key);
      // Require calendarConnected as part of isProfileComplete
      if (!already && isProfileComplete) {
        const ae = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
        const isEditing = !!ae && ((ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
        if (isEditing) {
          const onBlurOnce = () => {
            document.removeEventListener('focusout', onBlurOnce, true);
            // Re-check to avoid showing if conditions changed
            const stillComplete = isProfileComplete;
            if (stillComplete) setShowFirstTimeCompleteCta(true);
          };
          document.addEventListener('focusout', onBlurOnce, true);
        } else {
          setShowFirstTimeCompleteCta(true);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isProfileComplete]);

  const markOnboardingComplete = () => {
    if (!user) return;
    try { localStorage.setItem(`sp:onboard:complete:${user.id}`, '1'); } catch {}
    setShowFirstTimeCompleteCta(false);
  };

  const goAddService = () => {
    markOnboardingComplete();
    router.push('/dashboard/artist?tab=services');
  };
  const goDashboard = () => {
    markOnboardingComplete();
    router.push('/dashboard/artist');
  };

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
        setSpecialtiesInput(fetchedProfile.specialties?.join(', ') || '');
        setPortfolioUrlsInput(fetchedProfile.portfolio_urls?.join(', ') || '');
        setPortfolioImages(fetchedProfile.portfolio_image_urls || []);
        // Policies: prefer backend, fall back to localStorage if missing; derive template
        try {
          const uid = fetchedProfile.user?.id || user?.id || 0;
          const localPolicy = localStorage.getItem(`sp:policy:${uid}`) || '';
          const policy = fetchedProfile.cancellation_policy || localPolicy || '';
          setCancellationPolicy(policy);
          if (policy) {
            if (policy === POLICY_TEMPLATES.flexible) setPolicyTemplate('flexible');
            else if (policy === POLICY_TEMPLATES.moderate) setPolicyTemplate('moderate');
            else if (policy === POLICY_TEMPLATES.strict) setPolicyTemplate('strict');
            else setPolicyTemplate('custom');
          } else {
            setPolicyTemplate('flexible');
          }
        } catch {
          setCancellationPolicy(fetchedProfile.cancellation_policy || '');
        }

        // Contact details defaults (prefer backend, then local overrides, then sensible fallbacks)
        try {
          const uid = fetchedProfile.user?.id || user?.id || 0;
          const localContact = JSON.parse(localStorage.getItem(`sp:contact:${uid}`) || '{}');
          const backendEmail = (fetchedProfile as any).contact_email || fetchedProfile.user?.email || '';
          const backendPhone = (fetchedProfile as any).contact_phone || fetchedProfile.user?.phone_number || '';
          const backendWebsite = (fetchedProfile as any).contact_website || (fetchedProfile.portfolio_urls?.[0] || '');
          const derivedEmail = backendEmail || localContact.email || '';
          const derivedPhone = backendPhone || localContact.phone || '';
          const derivedWebsite = backendWebsite || localContact.website || '';
          setContactEmailInput(derivedEmail);
          setContactPhoneInput(derivedPhone);
          setContactWebsiteInput(derivedWebsite);
          // Initialize the ZA phone rest (digits after +27)
          try {
            const digits = (derivedPhone || '').startsWith('+27') ? (derivedPhone || '').slice(3) : '';
            setPhoneRest(digits.replace(/\D/g, '').slice(0, 9));
          } catch {}

          const localBank = JSON.parse(localStorage.getItem(`sp:bank:${uid}`) || '{}');
          setBankNameInput(localBank.bank_name || (fetchedProfile as any).bank_name || '');
          setBankAccountNameInput(localBank.account_name || (fetchedProfile as any).bank_account_name || '');
          setBankAccountNumberInput(localBank.account_number || (fetchedProfile as any).bank_account_number || '');
          setBankBranchCodeInput(localBank.branch_code || (fetchedProfile as any).bank_branch_code || '');

          // Auto-persist contact details if backend missing but we have derived values.
          const needsPersist = !((fetchedProfile as any).contact_email) || !((fetchedProfile as any).contact_phone) || !((fetchedProfile as any).contact_website);
          if (needsPersist && (derivedEmail || derivedPhone || derivedWebsite)) {
            try {
              await updateMyServiceProviderProfile({
                contact_email: derivedEmail || undefined,
                contact_phone: derivedPhone || undefined,
                contact_website: derivedWebsite || undefined,
              } as any);
              // Reflect in local profile state
              setProfile((prev) => ({
                ...prev,
                contact_email: derivedEmail || undefined,
                contact_phone: derivedPhone || undefined,
                contact_website: derivedWebsite || undefined,
              } as any));
            } catch (e) {
              // Non-fatal; UI will still show local values
              console.warn('Auto-persist contact details failed', e);
            }
          }
        } catch {}

        const currentRelativePic = fetchedProfile.profile_picture_url || '';
        setProfilePictureUrlInput(currentRelativePic);
        setImagePreviewUrl(getFullImageUrl(currentRelativePic));

        setCoverPhotoUrl(getFullImageUrl(fetchedProfile.cover_photo_url));

        // VAT/business details
        try {
          setLegalNameInput(((fetchedProfile as any).legal_name || fetchedProfile.business_name || '').toString());
          setVatRegisteredInput(!!(fetchedProfile as any).vat_registered);
          setVatNumberInput(((fetchedProfile as any).vat_number || '').toString());
          const rate = (fetchedProfile as any).vat_rate;
          setVatRateInput(rate !== undefined && rate !== null ? String(rate) : '15.0');
          setInvoiceEmailInput(((fetchedProfile as any).invoice_email || (fetchedProfile as any).contact_email || '').toString());
          setAgentConsentInput(!!(fetchedProfile as any).agent_invoicing_consent);
        } catch {}

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
      setCalendarCardMessage('Google Calendar connected successfully.');
      setCalendarConnected(true);
      justSyncedRef.current = true;
    } else if (syncStatus === 'error') {
      setCalendarCardMessage('Failed to connect Google Calendar.');
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
        // hourly_rate removed from UI
        specialties: specialtiesInput
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s),
        portfolio_urls: portfolioUrlsInput
          .split(',')
          .map((u) => u.trim())
          .filter((u) => u)
          .map((u) => {
            const canon = normalizeAssetPathForStorage(u);
            // If it resolved to one of our mounts, store canonical path
            if (/^(profile_pics|cover_photos|portfolio_images|attachments)\//i.test(canon)) {
              return canon;
            }
            // Otherwise, treat as external link; ensure scheme present
            if (/^https?:\/\//i.test(u)) return u;
            return `http://${u}`;
          }),
        portfolio_image_urls: portfolioImages,
        profile_picture_url: profilePictureUrlInput.trim()
          ? profilePictureUrlInput.trim()
          : undefined,
        cancellation_policy: cancellationPolicy.trim() || undefined,
      };

      // Persist contact/bank details to localStorage for use in Event Prep & elsewhere
      try {
        const uid = user?.id || profile.user_id || 0;
        localStorage.setItem(
          `sp:contact:${uid}`,
          JSON.stringify({
            email: contactEmailInput.trim(),
            phone: contactPhoneInput.trim(),
            website: contactWebsiteInput.trim(),
          }),
        );
        localStorage.setItem(
          `sp:bank:${uid}`,
          JSON.stringify({
            bank_name: bankNameInput.trim(),
            account_name: bankAccountNameInput.trim(),
            account_number: bankAccountNumberInput.trim(),
            branch_code: bankBranchCodeInput.trim(),
          }),
        );
      } catch {}

      // Send through to backend as custom fields (ok if ignored)
      (dataToUpdate as any).contact_email = contactEmailInput.trim() || undefined;
      (dataToUpdate as any).contact_phone = contactPhoneInput.trim() || undefined;
      (dataToUpdate as any).contact_website = contactWebsiteInput.trim() || undefined;
      (dataToUpdate as any).bank_name = bankNameInput.trim() || undefined;
      (dataToUpdate as any).bank_account_name = bankAccountNameInput.trim() || undefined;
      (dataToUpdate as any).bank_account_number = bankAccountNumberInput.trim() || undefined;
      (dataToUpdate as any).bank_branch_code = bankBranchCodeInput.trim() || undefined;

      await updateMyServiceProviderProfile(dataToUpdate);
      setSuccessMessage('Profile details updated successfully!');
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError('Failed to update profile details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // When calendar is connected and profile is complete, surface the CTA if not shown.
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.user_type !== 'service_provider') return;
    if (!calendarConnected) return;
    try {
      const key = `sp:onboard:complete:${user.id}`;
      const already = localStorage.getItem(key);
      if (!already && isProfileComplete) {
        // Use success variant when arriving from calendar callback
        setCtaVariant(justSyncedRef.current ? 'calendar_success' : 'generic');
        const ae = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
        const isEditing = !!ae && ((ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
        if (isEditing) {
          const onBlurOnce = () => {
            document.removeEventListener('focusout', onBlurOnce, true);
            const stillComplete = isProfileComplete;
            if (stillComplete) setShowFirstTimeCompleteCta(true);
          };
          document.addEventListener('focusout', onBlurOnce, true);
        } else {
          setShowFirstTimeCompleteCta(true);
        }
        justSyncedRef.current = false;
      }
    } catch {}
  }, [calendarConnected, isProfileComplete, authLoading, user]);

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

      // Try direct R2 upload (Option A) with safe fallback to legacy endpoint
      let finalUrl = '';
      try {
        const presign = await presignMyAvatar({ filename: croppedImageFile.name, content_type: croppedImageFile.type || 'image/jpeg' });
        const { put_url, headers, key, public_url } = presign.data as any;
        if (put_url) {
          await fetch(put_url, { method: 'PUT', headers: headers || {}, body: croppedImageFile });
        }
        await updateMyServiceProviderProfile({ profile_picture_url: key || public_url || undefined });
        finalUrl = public_url || (key ? `${(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || 'https://media.booka.co.za').replace(/\/+$/, '')}/${key}` : '');
      } catch (e) {
        // Fallback: legacy multipart upload that stores a data URL
        const response = await uploadMyServiceProviderProfilePicture(croppedImageFile);
        finalUrl = response.data.profile_picture_url || '';
      }
      setProfilePictureUrlInput(finalUrl);
      setImagePreviewUrl(getFullImageUrl(finalUrl));
      setProfile((prev) => ({ ...prev, profile_picture_url: finalUrl }));
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

  const handleCoverPhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCoverPhotoError(null);
    setCoverPhotoSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverCrop(undefined);
    setCoverCompletedCrop(undefined);
    const reader = new FileReader();
    reader.onloadend = () => {
      setCoverOriginalSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  async function applyCoverCropAndUpload() {
    if (!coverOriginalSrc || !coverImgRef.current) return;
    // Always compute pixel crop from current UI crop or centered default
    const imgEl = coverImgRef.current;
    const baseCrop = (coverCrop as any) || { x: 0, y: 0, width: 100, height: 100, unit: '%' };
    const pixelCrop = toPixelCrop(imgEl, baseCrop);
    setCoverCompletedCrop(pixelCrop);
    setUploadingCoverPhoto(true);
    try {
      const cropped = await getCroppedImg(
        coverOriginalSrc,
        pixelCrop,
        'cover.jpg',
        Math.max(1, Math.round(pixelCrop.width)),
        Math.max(1, Math.round(pixelCrop.height))
      );
      if (!cropped) throw new Error('Failed to crop cover');
      mediaHint.startSaving();
      // Prefer R2 presign → PUT → PATCH with key; fallback to legacy endpoint
      let newRelativeCoverUrl = '';
      try {
        const presign = await presignMyCoverPhoto({ filename: 'cover.jpg', content_type: 'image/jpeg' });
        const { put_url, headers, key, public_url } = presign.data as any;
        if (put_url) await fetch(put_url, { method: 'PUT', headers: headers || {}, body: cropped });
        await updateMyServiceProviderProfile({ cover_photo_url: key || public_url || undefined } as any);
        newRelativeCoverUrl = key || public_url || '';
      } catch (e) {
        const response = await uploadMyServiceProviderCoverPhoto(cropped);
        newRelativeCoverUrl = response.data.cover_photo_url || '';
      }
      setCoverPhotoUrl(getFullImageUrl(newRelativeCoverUrl));
      setProfile((prev) => ({ ...prev, cover_photo_url: newRelativeCoverUrl || undefined }));
      setCoverPhotoSuccessMessage('Cover photo updated');
      setCoverOriginalSrc(null);
      setCoverCompletedCrop(undefined);
      mediaHint.doneSaving();
    } catch (err: any) {
      console.error('Cover crop/upload failed:', err);
      setCoverPhotoError(err?.message || 'Failed to upload cover photo.');
      mediaHint.stopSaving();
    } finally {
      setUploadingCoverPhoto(false);
    }
  }

  const handlePortfolioFilesChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPortfolioImages(true);
    mediaHint.startSaving();
    try {
      const fileArray = Array.from(files);
      // Try presign for each file; fallback to legacy endpoint on failure
      try {
        const newKeys: string[] = [];
        for (const f of fileArray) {
          const presign = await presignMyPortfolioImage({ filename: f.name, content_type: f.type || 'image/jpeg' });
          const { put_url, headers, key, public_url } = presign.data as any;
          if (put_url) await fetch(put_url, { method: 'PUT', headers: headers || {}, body: f });
          newKeys.push(String(key || public_url || '').trim());
        }
        const canonNew = newKeys.filter(Boolean);
        const updated = [...(portfolioImages || []), ...canonNew];
        setPortfolioImages(updated);
        setProfile((prev) => ({ ...prev, portfolio_image_urls: updated } as any));
        await updateMyServiceProviderPortfolioImageOrder(updated.map(normalizeAssetPathForStorage));
      } catch (e) {
        const response = await uploadMyServiceProviderPortfolioImages(fileArray);
        const urls = (response.data.portfolio_image_urls || []).map(normalizeAssetPathForStorage);
        setPortfolioImages(urls);
        setProfile((prev) => ({ ...prev, portfolio_image_urls: urls }));
      }
      mediaHint.doneSaving();
    } catch (err) {
      console.error('Failed to upload portfolio images:', err);
      setError('Failed to upload portfolio images.');
      mediaHint.stopSaving();
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
      const canon = arr.map(normalizeAssetPathForStorage);
      updateMyServiceProviderPortfolioImageOrder(canon).catch((err) => {
        console.error('Failed to update portfolio order:', err);
      });
      return canon;
    });
    dragIndex.current = null;
  };

  const handleConnectCalendar = async () => {
    try {
      // Flush core fields before redirect so completion state persists
      try {
        await updateMyServiceProviderProfile({
          business_name: businessNameInput.trim() || undefined,
          description: descriptionInput.trim() || undefined,
          location: locationInput.trim() || undefined,
          contact_email: contactEmailInput.trim() || undefined,
          contact_phone: contactPhoneInput.trim() || undefined,
          contact_website: contactWebsiteInput.trim() || undefined,
          specialties: specialtiesInput.split(',').map(s=>s.trim()).filter(Boolean),
          cancellation_policy: cancellationPolicy.trim() || undefined,
        } as any);
      } catch (e) {
        console.warn('Pre-sync profile flush failed (non-fatal):', e);
      }
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
    'inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-dark hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed';

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

        {showFirstTimeCompleteCta && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-5">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                {ctaVariant === 'calendar_success' ? 'Success — all details are in.' : 'All details are in — let’s get started.'}
              </h3>
              <p className="mt-2 text-sm text-gray-700">
                {ctaVariant === 'calendar_success' ? 'Calendar connected successfully. You can add your first service now or head to your dashboard.' : 'Great work completing your profile. You can add your first service now or head to your dashboard.'}
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className="text-sm text-gray-600 hover:text-gray-800"
                  onClick={markOnboardingComplete}
                >
                  Dismiss
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <button type="button" onClick={goAddService} className="inline-flex items-center justify-center rounded-md bg-green-600 hover:bg-green-700 text-white px-3 py-2 text-sm font-medium">All details are in, let’s get started</button>
                <button type="button" onClick={goAddService} className="inline-flex items-center justify-center rounded-md border border-green-300 bg-white text-green-800 hover:bg-green-50 px-3 py-2 text-sm">Add Service</button>
                <button type="button" onClick={goDashboard} className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 px-3 py-2 text-sm">Go to Dashboard</button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded-md">{error}</p>}
        {successMessage && <p className="mb-4 text-sm text-green-600 bg-green-100 p-3 rounded-md">{successMessage}</p>}

        {/* Media Card */}
            <section className="relative bg-white rounded-2xl border border-gray-200 p-5 shadow-sm md:col-span-2">
              {/* Card counter */}
              <div className={`${(imagePreviewUrl && coverPhotoUrl) ? 'text-green-800 bg-green-100 border-green-300' : 'text-gray-600 bg-gray-100 border-gray-200'} absolute bottom-3 right-3 text-xs border rounded-full px-2 py-0.5`}>1/6</div>
              <div className="absolute right-4 top-4"><SavedPill saving={mediaHint.saving} saved={mediaHint.saved} /></div>
              <h2 className="text-xl font-medium text-gray-700 mb-4">Profile Media</h2>
              {/* Overlay to close modals when clicking outside (hidden during crop UI) */}
              {(showCoverModal || showProfileModal) && !coverOriginalSrc && !showCropper && (
                <button
                  type="button"
                  aria-label="Close media modal"
                  className="absolute inset-0 z-10 rounded-2xl"
                  onClick={()=>{ setShowCoverModal(false); setShowProfileModal(false); }}
                />
              )}
              {/* Cover large */}
              <div className="relative w-2/3 mx-auto">
                {coverPhotoUrl ? (
                  <NextImage
                    src={coverPhotoUrl}
                    alt="Cover Photo"
                    width={1600}
                    height={900}
                    className="w-full aspect-[16/9] object-cover rounded-xl border"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label="Upload cover photo"
                    className="w-full aspect-[16/9] rounded-xl bg-gray-200 flex items-center justify-center text-gray-600 border hover:bg-gray-300/60 transition"
                    onClick={() => {
                      document
                        .getElementById('coverPhotoInput')
                        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    }}
                  >
                    No cover — click to add
                  </button>
                )}
                <button
                  type="button"
                  className="absolute left-3 top-3 inline-flex items-center rounded-md bg-white/90 hover:bg-white border border-gray-300 px-3 py-1.5 text-sm text-gray-800 shadow-sm"
                  onClick={() => setShowCoverModal(true)}
                >
                  Edit
                </button>
                {/* Dim overlay when modal open */}
                {showCoverModal && (
                  <>
                    <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
                      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Cover Photo</h3>
                        <div className="space-y-2">
                          <button type="button" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" onClick={()=>{ document.getElementById('coverPhotoInput')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); setShowCoverModal(false); }}>Upload new cover photo</button>
                          {/* Crop again removed per request */}
                          <button type="button" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" onClick={()=>setShowCoverModal(false)}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {/* hidden input for cover */}
                <input id="coverPhotoInput" type="file" accept="image/*" onChange={handleCoverPhotoFileChange} className="hidden" />
              </div>

              {/* Cover crop UI below */}
              {coverOriginalSrc && (
                <div className="relative z-30 space-y-2 mt-4">
                  <ReactCrop
                    crop={coverCrop}
                    onChange={(_, p)=> setCoverCrop(p)}
                    onComplete={(c: any) => {
                      const img = coverImgRef.current;
                      if (img) setCoverCompletedCrop(toPixelCrop(img, c)); else setCoverCompletedCrop(c);
                    }}
                    aspect={COVER_ASPECT}
                    className="max-w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={coverImgRef} src={coverOriginalSrc} alt="Cover crop" className="max-h-72" onLoad={(e)=>{
                      const imgEl = e.currentTarget as HTMLImageElement;
                      if (imgEl.naturalWidth && imgEl.naturalHeight) {
                        const centered = centerAspectCrop(imgEl.naturalWidth, imgEl.naturalHeight, COVER_ASPECT);
                        setCoverCrop(centered as any);
                        setCoverCompletedCrop(toPixelCrop(imgEl, centered as any));
                      }
                    }} />
                  </ReactCrop>
                  <div className="flex gap-2">
                    <button type="button" className={primaryButtonClasses} onClick={applyCoverCropAndUpload} disabled={uploadingCoverPhoto}>{uploadingCoverPhoto ? 'Uploading…' : 'Apply Crop & Upload'}</button>
                    <button type="button" className="px-3 py-2 text-sm border rounded-md" onClick={()=>{ setCoverOriginalSrc(null); setCoverCompletedCrop(undefined); }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Profile avatar overlapping (hidden while cover crop UI is visible) */}
              {!coverOriginalSrc && (
              <div className="relative -mt-10 mb-4 flex justify-center">
                <div className="relative w-24 h-24">
                  {imagePreviewUrl ? (
                    <NextImage src={imagePreviewUrl} alt="Profile" width={96} height={96} className="w-24 h-24 rounded-full object-cover border-4 border-white shadow" unoptimized />
                  ) : (
                    <button
                      type="button"
                      aria-label="Upload profile picture"
                      className="w-24 h-24 rounded-full bg-gray-200 border-4 border-white shadow flex items-center justify-center text-gray-600 hover:bg-gray-300/60 transition"
                      onClick={() => {
                        document
                          .getElementById('profilePicInputHidden')
                          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                      }}
                    >
                      No image — click to add
                    </button>
                  )}
                  <button type="button" aria-label="Edit profile picture" className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-300 shadow" onClick={()=> setShowProfileModal(true)}>+
                  </button>
                  {showProfileModal && (
                    <>
                      <div className="absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2">
                        <div className="w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Profile Picture</h3>
                          <div className="space-y-2">
                            <button type="button" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" onClick={()=>{ document.getElementById('profilePicInputHidden')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); setShowProfileModal(false); }}>Upload new profile picture</button>
                            <button type="button" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" onClick={async()=>{
                              try {
                                const url = getFullImageUrl(profilePictureUrlInput);
                                if (url) {
                                  const res = await fetch(url);
                                  const blob = await res.blob();
                                  const reader = new FileReader();
                                  reader.onloadend = ()=> { setOriginalImageSrc(reader.result as string); setShowCropper(true); };
                                  reader.readAsDataURL(blob);
                                }
                              } catch {}
                              setShowProfileModal(false);
                            }}>Crop again</button>
                            <button type="button" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" onClick={()=>setShowProfileModal(false)}>Cancel</button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                </div>
              )}
                {/* hidden input for profile */}
                <input id="profilePicInputHidden" type="file" accept="image/*" onChange={handleImageFileChange} className="hidden" />

              {/* Profile crop UI */}
              {showCropper && originalImageSrc && (
                <div className="space-y-2">
                  <ReactCrop
                    crop={crop}
                    onChange={(_, p) => setCrop(p)}
                    onComplete={(c: any) => {
                      const img = imgRef.current;
                      if (img) setCompletedCrop(toPixelCrop(img, c)); else setCompletedCrop(c);
                    }}
                    aspect={aspect}
                    className="max-w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={imgRef} src={originalImageSrc} alt="Crop preview" onLoad={onImageLoad} className="max-h-72" />
                  </ReactCrop>
                  <div className="flex gap-2">
                    <button type="button" className={primaryButtonClasses} onClick={handleCropAndUpload} disabled={uploadingImage || !completedCrop?.width}>{uploadingImage ? 'Uploading…' : 'Apply Crop & Upload'}</button>
                    <button type="button" className="px-3 py-2 text-sm border rounded-md" onClick={()=>{ setShowCropper(false); setOriginalImageSrc(null); }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Portfolio Images full width */}
              <div className="mt-6">
                <div className="flex items-center gap-2">
                  <label htmlFor="portfolioImagesInput" className={labelClasses}>Portfolio Images</label>
                  <button
                    type="button"
                    aria-label="Add portfolio images"
                    title="Add images"
                    data-testid="add-portfolio-button"
                    className="inline-flex items-center justify-center rounded-md bg-white border border-gray-300 shadow hover:bg-gray-50 disabled:opacity-50 px-2 py-1 text-xs"
                    onClick={() => document.getElementById('portfolioImagesInput')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
                    disabled={uploadingPortfolioImages}
                  >
                    + Add
                  </button>
                </div>
                <input id="portfolioImagesInput" type="file" accept="image/*" multiple onChange={handlePortfolioFilesChange} className="hidden" disabled={uploadingPortfolioImages} />
                {uploadingPortfolioImages && (<p className="text-sm text-gray-700 mt-1">Uploading images…</p>)}
                {portfolioImages.length > 0 && (
                  <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3" data-testid="portfolio-list">
                    {portfolioImages.map((url, idx) => (
                      <li key={url} data-testid="portfolio-item" draggable onDragStart={handleDragStart(idx)} onDragOver={(e)=>e.preventDefault()} onDrop={handleDrop(idx)} className="relative group border rounded-md overflow-hidden">
                        <button type="button" className="relative w-full h-24 bg-white block" onClick={() => { setPortfolioPreviewIndex(idx); setPortfolioPreviewOpen(true); }} aria-label={`View portfolio image ${idx + 1}`}>
                          <NextImage src={getFullImageUrl(url) || ''} alt={`Portfolio ${idx + 1}`} fill className="object-contain p-1" loading="lazy" />
                        </button>
                        <button type="button" aria-label="Delete" onClick={()=>{
                          const next = portfolioImages.filter((u)=>u!==url);
                          setPortfolioImages(next);
                          mediaHint.startSaving();
                          updateMyServiceProviderPortfolioImageOrder(next).then(()=>mediaHint.doneSaving()).catch(()=>mediaHint.stopSaving());
                        }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs text-gray-700">Delete</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

        {/* Full-screen portfolio image preview modal */}
        {portfolioImages.length > 0 && (
          <ImagePreviewModal
            open={portfolioPreviewOpen}
            src={getFullImageUrl(portfolioImages[portfolioPreviewIndex] || '') || ''}
            images={portfolioImages.map((u) => getFullImageUrl(u)).filter(Boolean) as string[]}
            index={portfolioPreviewIndex}
            onIndexChange={setPortfolioPreviewIndex}
            onClose={() => setPortfolioPreviewOpen(false)}
          />
        )}


        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-8 divide-y divide-gray-200"
        >
          <div className="space-y-6 pt-8 sm:space-y-5">
            <section className="relative bg-white rounded-2xl border border-gray-200 p-5 pb-10 shadow-sm">
              {/* Card counter */}
              <div className={(() => {
                const done = !!businessNameInput.trim() && !!descriptionInput.trim() && !!locationInput.trim() && !!specialtiesInput.trim();
                return done ? 'absolute bottom-3 right-3 text-xs text-green-800 bg-green-100 border border-green-300 rounded-full px-2 py-0.5' : 'absolute bottom-3 right-3 text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5';
              })()}>2/6</div>
              <div className="absolute right-4 top-4"><SavedPill saving={bizHint.saving} saved={bizHint.saved} /></div>
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
                    onChange={(e) => {
                      const v = e.target.value;
                      setBusinessNameInput(v);
                      if (bizTimerRef.current) clearTimeout(bizTimerRef.current);
                      bizHint.startSaving();
                      bizTimerRef.current = setTimeout(async () => {
                        try {
                          await updateMyServiceProviderProfile({
                            business_name: v.trim() || undefined,
                          } as any);
                          bizHint.doneSaving();
                        } catch {
                          bizHint.stopSaving();
                        }
                      }, 800);
                    }}
                    onBlur={async (e) => {
                      const v = e.target.value;
                      if (bizTimerRef.current) clearTimeout(bizTimerRef.current);
                      bizHint.startSaving();
                      try {
                        await updateMyServiceProviderProfile({ business_name: v.trim() || undefined } as any);
                        bizHint.doneSaving();
                      } catch {
                        bizHint.stopSaving();
                      }
                    }}
                    className={inputClasses}
                    placeholder="e.g., Your Awesome Studio"
                    required
                  />
                  {!businessNameInput.trim() && (
                    <div className="mt-1 text-xs text-red-600">Required</div>
                  )}
                </div>
                <div>
                  <label htmlFor="customSubtitle" className={labelClasses}>
                    Subtitle / Tagline
                  </label>
                  <input
                    type="text"
                    id="customSubtitle"
                    value={customSubtitleInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomSubtitleInput(v);
                      if (bizTimerRef.current) clearTimeout(bizTimerRef.current);
                      bizHint.startSaving();
                      bizTimerRef.current = setTimeout(async () => {
                        try {
                          await updateMyServiceProviderProfile({
                            custom_subtitle: v.trim() || undefined,
                          } as any);
                          bizHint.doneSaving();
                        } catch {
                          bizHint.stopSaving();
                        }
                      }, 800);
                    }}
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
                    onChange={(e) => {
                      const v = e.target.value;
                      setDescriptionInput(v);
                      if (bizTimerRef.current) clearTimeout(bizTimerRef.current);
                      bizHint.startSaving();
                      bizTimerRef.current = setTimeout(async () => {
                        try {
                          await updateMyServiceProviderProfile({
                            description: v,
                          } as any);
                          bizHint.doneSaving();
                        } catch {
                          bizHint.stopSaving();
                        }
                      }, 800);
                    }}
                    rows={6}
                    className={inputClasses}
                    placeholder="Tell us about yourself, your art, and your services..."
                  />
                  {!descriptionInput.trim() && (
                    <div className="mt-1 text-xs text-red-600">Required</div>
                  )}
                </div>
                <div>
                  <label htmlFor="location" className={labelClasses}>
                    Location
                  </label>
                  <LocationInput
                    value={locationInput}
                    onValueChange={(v) => {
                      setLocationInput(v);
                      if (bizTimerRef.current) clearTimeout(bizTimerRef.current);
                      bizHint.startSaving();
                      bizTimerRef.current = setTimeout(async () => {
                        try {
                          await updateMyServiceProviderProfile({ location: v.trim() || undefined } as any);
                          bizHint.doneSaving();
                        } catch {
                          bizHint.stopSaving();
                        }
                      }, 800);
                    }}
                    onPlaceSelect={() => {}}
                    placeholder="e.g., City, State or Studio Address"
                    inputClassName={inputClasses}
                  />
                  {!locationInput.trim() && (
                    <div className="mt-1 text-xs text-red-600">Required</div>
                  )}
                </div>
                {/* Specialties moved here (required) */}
                <div>
                  <label htmlFor="specialties" className={labelClasses}>
                    Specialties (comma-separated)
                  </label>
                  <input
                    type="text"
                    id="specialties"
                    value={specialtiesInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSpecialtiesInput(v);
                      if (profTimerRef.current) clearTimeout(profTimerRef.current);
                      profHint.startSaving();
                      profTimerRef.current = setTimeout(async ()=>{
                        try {
                          const arr = v.split(',').map(s=>s.trim()).filter(Boolean);
                          await updateMyServiceProviderProfile({ specialties: arr } as any);
                          profHint.doneSaving();
                        } catch { profHint.stopSaving(); }
                      }, 800);
                    }}
                    className={inputClasses}
                    placeholder="e.g., Portraits, Landscapes, Events"
                  />
                  {!specialtiesInput.trim() && (
                    <div className="mt-1 text-xs text-red-600">Required</div>
                  )}
                </div>
                {/* Portfolio URLs moved here (optional) */}
                <div>
                  <label htmlFor="portfolioUrls" className={labelClasses}>
                    Portfolio URLs (comma-separated)
                  </label>
                  <input
                    type="text"
                    id="portfolioUrls"
                    value={portfolioUrlsInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPortfolioUrlsInput(v);
                      if (profTimerRef.current) clearTimeout(profTimerRef.current);
                      profHint.startSaving();
                      profTimerRef.current = setTimeout(async ()=>{
                        try {
                          const arr = v.split(',').map(u=>u.trim()).filter(Boolean).map(u=> (u.startsWith('http://')||u.startsWith('https://'))?u:`http://${u}`);
                          await updateMyServiceProviderProfile({ portfolio_urls: arr } as any);
                          profHint.doneSaving();
                        } catch { profHint.stopSaving(); }
                      }, 800);
                    }}
                    className={inputClasses}
                    placeholder="e.g., https://myportfolio.com, https://instagram.com/me"
                  />
                </div>
              </div>
            </section>

        


            {/* Contact Details (sent to client on confirmation) */}
            <section className="pt-8 relative bg-white rounded-2xl border border-gray-200 p-5 pb-10 shadow-sm">
              {/* Card counter */}
              <div className={`${(isValidEmail(contactEmailInput) && isValidZANumber(contactPhoneInput) && isLikelyUrl(contactWebsiteInput)) ? 'text-green-800 bg-green-100 border-green-300' : 'text-gray-600 bg-gray-100 border-gray-200'} absolute bottom-3 right-3 text-xs border rounded-full px-2 py-0.5`}>3/6</div>
              <div className="absolute right-4 top-4"><SavedPill saving={contactHint.saving} saved={contactHint.saved} /></div>
              <h2 className="text-xl font-medium text-gray-700 mb-2">Contact Details</h2>
              <p className="text-xs text-gray-500 mb-4">These details are shared with the client when a booking is confirmed.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Contact email</label>
                  <input
                    type="email"
                    className={`${inputClasses} ${contactEmailInput && !isValidEmail(contactEmailInput) ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    value={contactEmailInput}
                    onChange={(e)=>{
                      const v = e.target.value;
                      setContactEmailInput(v);
                      if (contactTimerRef.current) clearTimeout(contactTimerRef.current);
                      contactHint.startSaving();
                      contactTimerRef.current = setTimeout(async ()=>{
                        try { await updateMyServiceProviderProfile({ contact_email: v || undefined } as any); contactHint.doneSaving(); }
                        catch { contactHint.stopSaving(); }
                      }, 800);
                    }}
                    placeholder="you@example.com"
                  />
                  {contactEmailInput && !isValidEmail(contactEmailInput) && (
                    <div className="mt-1 text-xs text-red-600">Enter a valid email e.g. you@example.com</div>
                  )}
                </div>
                <div>
                  <label className={labelClasses}>Cell number</label>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-gray-50 text-gray-700 sm:text-sm select-none">+27</span>
                    <input
                      type="tel"
                      className={`${inputClasses} flex-1 ${contactPhoneInput && !isValidZANumber(contactPhoneInput) ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      value={phoneRest}
                      onChange={(e)=>{
                        const rest = e.target.value.replace(/\D/g, '').slice(0, 9);
                        setPhoneRest(rest);
                        const v = rest ? `+27${rest}` : '';
                        setContactPhoneInput(v);
                        if (contactTimerRef.current) clearTimeout(contactTimerRef.current);
                        contactHint.startSaving();
                        contactTimerRef.current = setTimeout(async ()=>{
                          if (!v || isValidZANumber(v)) {
                            try { await updateMyServiceProviderProfile({ contact_phone: v || undefined } as any); contactHint.doneSaving(); }
                            catch { contactHint.stopSaving(); }
                          } else {
                            contactHint.stopSaving();
                          }
                        }, 800);
                      }}
                      placeholder="821234567"
                      inputMode="numeric"
                      pattern="\\d{9}"
                      maxLength={9}
                    />
                  </div>
                  {contactPhoneInput && !isValidZANumber(contactPhoneInput) && (
                    <div className="mt-1 text-xs text-red-600">Enter a valid number e.g. +27821234567</div>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClasses}>Website</label>
                  <input
                    type="url"
                    className={`${inputClasses} ${contactWebsiteInput && !isLikelyUrl(contactWebsiteInput) ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    value={contactWebsiteInput}
                    onChange={(e)=>{
                      const v = e.target.value;
                      setContactWebsiteInput(v);
                      if (contactTimerRef.current) clearTimeout(contactTimerRef.current);
                      contactHint.startSaving();
                      contactTimerRef.current = setTimeout(async ()=>{
                        try { await updateMyServiceProviderProfile({ contact_website: v || undefined } as any); contactHint.doneSaving(); }
                        catch { contactHint.stopSaving(); }
                      }, 800);
                    }}
                    placeholder="https://yourwebsite.com"
                  />
                  {contactWebsiteInput && !isLikelyUrl(contactWebsiteInput) && (
                    <div className="mt-1 text-xs text-red-600">Enter a valid website e.g. https://example.com</div>
                  )}
                </div>
              </div>
            </section>

        


            {/* Policies Wizard */}
            <section className="pt-8 relative bg-white rounded-2xl border border-gray-200 p-5 pb-10 shadow-sm">
              {/* Card counter */}
              <div className={`${(!!cancellationPolicy.trim()) ? 'text-green-800 bg-green-100 border-green-300' : 'text-gray-600 bg-gray-100 border-gray-200'} absolute bottom-3 right-3 text-xs border rounded-full px-2 py-0.5`}>4/6</div>
              <h2 className="text-xl font-medium text-gray-700 mb-3">Policies</h2>
              <p className="text-sm text-gray-600 mb-4">Set a cancellation policy clients will see before they book.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {(['flexible','moderate','strict','custom'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setPolicyTemplate(t);
                      if (t !== 'custom') {
                        const v = POLICY_TEMPLATES[t];
                        setCancellationPolicy(v);
                        if (policyTimerRef.current) clearTimeout(policyTimerRef.current);
                        policyHint.startSaving();
                        policyTimerRef.current = setTimeout(async () => {
                          try { 
                            await updateMyServiceProviderProfile({ cancellation_policy: v } as any);
                            try { const uid = user?.id || profile.user_id || 0; localStorage.setItem(`sp:policy:${uid}`, v); } catch {}
                            policyHint.doneSaving(); 
                          }
                          catch { policyHint.stopSaving(); }
                        }, 800);
                      }
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
                <div className="flex items-center justify-between">
                  <label htmlFor="cancellationPolicy" className={labelClasses}>Cancellation policy text</label>
                  <SavedPill saving={policyHint.saving} saved={policyHint.saved} />
                </div>
                <textarea
                  id="cancellationPolicy"
                  value={cancellationPolicy}
                  onChange={(e)=>{ 
                    const v = e.target.value; 
                    setCancellationPolicy(v); 
                    setPolicyTemplate('custom');
                    if (policyTimerRef.current) clearTimeout(policyTimerRef.current);
                    policyHint.startSaving();
                    policyTimerRef.current = setTimeout(async () => {
                      try {
                        const text = v.trim() || '';
                        await updateMyServiceProviderProfile({ cancellation_policy: text || undefined } as any);
                        try { const uid = user?.id || profile.user_id || 0; localStorage.setItem(`sp:policy:${uid}`, text); } catch {}
                        policyHint.doneSaving();
                      } catch {
                        policyHint.stopSaving();
                      }
                    }, 800);
                  }}
                  onBlur={(e)=>{
                    const v = e.target.value;
                    if (policyTimerRef.current) clearTimeout(policyTimerRef.current);
                    policyHint.startSaving();
                    (async()=>{
                      try { 
                        const text = v.trim() || '';
                        await updateMyServiceProviderProfile({ cancellation_policy: text || undefined } as any);
                        try { const uid = user?.id || profile.user_id || 0; localStorage.setItem(`sp:policy:${uid}`, text); } catch {}
                        policyHint.doneSaving(); 
                      }
                      catch { policyHint.stopSaving(); }
                    })();
                  }}
                  rows={5}
                  className={inputClasses}
                  placeholder="Write your policy here..."
                />
                {/* Live preview removed for a cleaner experience; autosaves are active */}
              </div>
            </section>

        


            <section className="pt-8 relative bg-white rounded-2xl border border-gray-200 p-5 pb-10 shadow-sm">
              {/* Card counter */}
              <div className={`${(!!bankNameInput.trim() && !!bankAccountNameInput.trim() && !!bankAccountNumberInput.trim() && !!bankBranchCodeInput.trim()) ? 'text-green-800 bg-green-100 border-green-300' : 'text-gray-600 bg-gray-100 border-gray-200'} absolute bottom-3 right-3 text-xs border rounded-full px-2 py-0.5`}>5/6</div>
              <div className="absolute right-4 top-4"><SavedPill saving={profHint.saving} saved={profHint.saved} /></div>
              <h2 className="text-xl font-medium text-gray-700 mb-6">Banking Details</h2>
              <p className="text-xs text-gray-600 mb-3">Not required now, but will be when we need to do payouts.</p>
              <div className="space-y-4">
                {/* Banking details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>Bank name</label>
                  <input type="text" className={inputClasses} value={bankNameInput} onChange={(e)=>{ const v=e.target.value; setBankNameInput(v); if (profTimerRef.current) clearTimeout(profTimerRef.current); profHint.startSaving(); profTimerRef.current = setTimeout(async ()=>{ try { await updateMyServiceProviderProfile({ bank_name: v.trim() || undefined } as any); profHint.doneSaving(); } catch { profHint.stopSaving(); } }, 800); }} placeholder="e.g., FNB" />
                </div>
                <div>
                  <label className={labelClasses}>Account name</label>
                  <input type="text" className={inputClasses} value={bankAccountNameInput} onChange={(e)=>{ const v=e.target.value; setBankAccountNameInput(v); if (profTimerRef.current) clearTimeout(profTimerRef.current); profHint.startSaving(); profTimerRef.current = setTimeout(async ()=>{ try { await updateMyServiceProviderProfile({ bank_account_name: v.trim() || undefined } as any); profHint.doneSaving(); } catch { profHint.stopSaving(); } }, 800); }} placeholder="Account holder name" />
                </div>
                <div>
                  <label className={labelClasses}>Account number</label>
                  <input type="text" className={inputClasses} value={bankAccountNumberInput} onChange={(e)=>{ const v=e.target.value; setBankAccountNumberInput(v); if (profTimerRef.current) clearTimeout(profTimerRef.current); profHint.startSaving(); profTimerRef.current = setTimeout(async ()=>{ try { await updateMyServiceProviderProfile({ bank_account_number: v.trim() || undefined } as any); profHint.doneSaving(); } catch { profHint.stopSaving(); } }, 800); }} placeholder="0000000000" />
                </div>
                <div>
                  <label className={labelClasses}>Branch code</label>
                  <input type="text" className={inputClasses} value={bankBranchCodeInput} onChange={(e)=>{ const v=e.target.value; setBankBranchCodeInput(v); if (profTimerRef.current) clearTimeout(profTimerRef.current); profHint.startSaving(); profTimerRef.current = setTimeout(async ()=>{ try { await updateMyServiceProviderProfile({ bank_branch_code: v.trim() || undefined } as any); profHint.doneSaving(); } catch { profHint.stopSaving(); } }, 800); }} placeholder="e.g., 250655" />
                </div>
              </div>
              {/* Hourly rate field removed per request */}
            </div>
          </section>

        


            <section className="pt-8 relative bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              {/* Card counter */}
              <div className={`${(calendarConnected) ? 'text-green-800 bg-green-100 border-green-300' : 'text-gray-600 bg-gray-100 border-gray-200'} absolute bottom-3 right-3 text-xs border rounded-full px-2 py-0.5`}>6/6</div>
              <h2 className="text-xl font-medium text-gray-700 mb-6">Sync Google Calendar</h2>
              {calendarCardMessage && (
                <p className="text-xs text-gray-600 mb-3">{calendarCardMessage}</p>
              )}
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

          {/* Bottom Save button removed; fields autosave */}
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
