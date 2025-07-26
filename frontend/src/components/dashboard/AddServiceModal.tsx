'use client';

import {
  useForm,
  type SubmitHandler,
} from 'react-hook-form';
import {
  useState,
  useRef,
  useEffect,
} from 'react';
import {
  MusicalNoteIcon,
  VideoCameraIcon,
  SparklesIcon,
  SquaresPlusIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { Service } from '@/types';
import {
  createService as apiCreateService,
  getDashboardStats,
} from '@/lib/api';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import Button from '../ui/Button';
import { Stepper, TextInput, TextArea, ToggleSwitch } from '../ui';

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServiceAdded: (newService: Service) => void;
}

interface PackageData {
  name: string;
  price: string;
}

interface ServiceFormData {
  service_type: Service['service_type'] | undefined;
  title: string;
  description: string;
  duration_minutes: number | '';
  is_remote: boolean;
}

export default function AddServiceModal({
  isOpen,
  onClose,
  onServiceAdded,
}: AddServiceModalProps) {
  const steps = ['1. Type', '2. Details', '3. Media', '4. Packages', 'Review'];
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<ServiceFormData>({
    defaultValues: {
      service_type: undefined,
      title: '',
      description: '',
      duration_minutes: 60,
      is_remote: false,
    },
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [packages, setPackages] = useState<PackageData[]>([
    { name: '', price: '' },
  ]);
  const [publishing, setPublishing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ monthly_new_inquiries: number }>();
  const watchTitle = watch('title');
  const watchDescription = watch('description');

  useEffect(() => {
    if (step === 3 && !stats) {
      getDashboardStats()
        .then((res) => setStats(res.data))
        .catch(() => {});
    }
  }, [step, stats]);

  const nextDisabled = () => {
    if (step === 0) return !watch('service_type');
    if (step === 1) {
      return !!(
        errors.title ||
        errors.description ||
        errors.duration_minutes
      );
    }
    if (step === 2) {
      return !mediaFiles.some((f) => f.type.startsWith('image/'));
    }
    if (step === 3) {
      return !packages[0].name || !packages[0].price;
    }
    return false;
  };

  const next = async () => {
    if (step === 1) {
      const valid = await trigger([
        'title',
        'description',
        'duration_minutes',
      ]);
      if (!valid) return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
    setMaxStep((m) => Math.max(m, step + 1));
  };

  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const onFileChange = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setMediaFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (i: number) =>
    setMediaFiles((prev) => prev.filter((_, idx) => idx !== i));

  const addPackage = () =>
    setPackages((prev) =>
      [...prev, { name: '', price: '' }].slice(0, 3),
    );

  const updatePackage = (
    i: number,
    field: keyof PackageData,
    value: string,
  ) => {
    setPackages((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)),
    );
  };

  const onSubmit: SubmitHandler<ServiceFormData> = async (data) => {
    setServerError(null);
    setPublishing(true);
    try {
      const price = parseFloat(packages[0].price || '0');
      const serviceData = {
        ...data,
        price,
        duration_minutes: Number(data.duration_minutes || 0),
      };
      const res = await apiCreateService(serviceData);
      onServiceAdded(res.data);
      reset();
      setMediaFiles([]);
      setPackages([{ name: '', price: '' }]);
      setStep(0);
      onClose();
    } catch (err: unknown) {
      console.error('Service creation error:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Failed to create service.';
      setServerError(msg);
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) return null;

  const types = [
    { value: 'Live Performance', label: 'Live Performance', Icon: MusicalNoteIcon },
    { value: 'Personalized Video', label: 'Personalized Video', Icon: VideoCameraIcon },
    { value: 'Custom Song', label: 'Custom Song', Icon: SparklesIcon },
    { value: 'Other', label: 'Other', Icon: SquaresPlusIcon },
  ];

  const earnings =
    stats && packages[0].price
      ? stats.monthly_new_inquiries * parseFloat(packages[0].price)
      : null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-md w-full max-w-4xl p-6">
        <Stepper
          steps={steps.slice(0, 4)}
          currentStep={step}
          maxStepCompleted={maxStep}
          onStepClick={(i) => i <= maxStep && setStep(i)}
        />
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {step === 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Choose Your Service Category
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {types.map(({ value, label, Icon }) => (
                  <button
                    type="button"
                    key={value}
                    data-value={value}
                    onClick={() => setValue('service_type', value)}
                    className={clsx(
                      'flex flex-col items-center p-4 border rounded-md',
                      watch('service_type') === value
                        ? 'border-brand bg-brand-light'
                        : 'border-gray-300',
                    )}
                  >
                    <Icon className="h-8 w-8 mb-2" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Service Details</h2>
              <TextInput
                label="Service Title"
                {...register('title', {
                  required: 'Service title is required',
                  minLength: { value: 5, message: 'Must be at least 5 characters' },
                  maxLength: { value: 60, message: 'Must be at most 60 characters' },
                })}
              />
              <p className="text-xs text-right text-gray-500">
                {(watchTitle || '').length}/60
              </p>
              <TextArea
                label="Description"
                rows={4}
                {...register('description', {
                  required: 'Description is required',
                  minLength: { value: 20, message: 'Must be at least 20 characters' },
                  maxLength: { value: 500, message: 'Must be at most 500 characters' },
                })}
              />
              <p className="text-xs text-right text-gray-500">
                {(watchDescription || '').length}/500
              </p>
              <TextInput
                label="Duration (minutes)"
                type="number"
                {...register('duration_minutes', {
                  required: 'Duration is required',
                  valueAsNumber: true,
                  min: { value: 1, message: 'Minimum 1' },
                })}
              />
              <div className="flex items-center gap-2">
                <ToggleSwitch
                  checked={watch('is_remote')}
                  onChange={(v) => setValue('is_remote', v)}
                  label="Remote"
                />
              </div>
              {errors.title && (
                <p className="text-sm text-red-600">{errors.title.message}</p>
              )}
              {errors.description && (
                <p className="text-sm text-red-600">{errors.description.message}</p>
              )}
              {errors.duration_minutes && (
                <p className="text-sm text-red-600">
                  {errors.duration_minutes.message}
                </p>
              )}
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Upload Media</h2>
              <div
                className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer"
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onFileChange(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone"
              >
                <p>Drag files here or click to upload</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,audio/*,video/*"
                  className="hidden"
                  onChange={(e) => onFileChange(e.target.files)}
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {mediaFiles.map((file, i) => (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    className="relative w-24 h-24 border rounded overflow-hidden"
                  >
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <span className="text-xs break-all p-1">{file.name}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-0 right-0 bg-black/50 text-white rounded-full w-4 h-4 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-500">
                Use at least 5 high-res photos (1024×683px) and a short video demo.
              </p>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Packages & Pricing</h2>
              {packages.map((pkg, i) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  className="border rounded-md p-4 space-y-2"
                >
                  <TextInput
                    label="Name"
                    value={pkg.name}
                    onChange={(e) => updatePackage(i, 'name', e.target.value)}
                    name={`packages[${i}].name`}
                  />
                  <TextInput
                    label={`Price (${DEFAULT_CURRENCY})`}
                    type="number"
                    step="0.01"
                    value={pkg.price}
                    onChange={(e) => updatePackage(i, 'price', e.target.value)}
                    name={`packages[${i}].price`}
                  />
                </div>
              ))}
              {packages.length < 3 && (
                <Button type="button" variant="secondary" onClick={addPackage}>
                  + Add Another Package
                </Button>
              )}
              {earnings !== null && (
                <p className="text-sm text-gray-600">
                  Estimated monthly earnings{' '}
                  {Intl.NumberFormat('en-ZA', {
                    style: 'currency',
                    currency: DEFAULT_CURRENCY,
                  }).format(earnings)}
                </p>
              )}
            </div>
          )}
          {step === 4 && (
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Review Your Service</h2>
              <p>
                <strong>Type:</strong> {watch('service_type')}
              </p>
              <p>
                <strong>Title:</strong> {watch('title')}
              </p>
              <p>
                <strong>Description:</strong> {watch('description')}
              </p>
              <p>
                <strong>Duration:</strong> {watch('duration_minutes')} minutes
              </p>
              <p>
                <strong>Packages:</strong>{' '}
                {packages.map((p) => `${p.name}: ${p.price}`).join('; ')}
              </p>
              {serverError && <p className="text-sm text-red-600">{serverError}</p>}
            </div>
          )}
          <div className="flex justify-between pt-4">
            {step > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={prev}
                data-testid="back"
              >
                Back
              </Button>
            )}
            {step < steps.length - 1 && (
              <Button
                type="button"
                onClick={next}
                disabled={nextDisabled()}
                data-testid="next"
              >
                Next
              </Button>
            )}
            {step === steps.length - 1 && (
              <Button type="submit" isLoading={publishing}>
                Publish
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
