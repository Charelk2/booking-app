"use client";

import { useForm, SubmitHandler } from "react-hook-form";
import { Service } from "@/types";
import { updateService as apiUpdateService } from "@/lib/api";
import { useState } from "react";
import axios from "axios";
import { extractErrorMessage } from "@/lib/utils";

interface EditServiceModalProps {
  isOpen: boolean;
  service: Service;
  onClose: () => void;
  onServiceUpdated: (updated: Service) => void;
}

type ServiceFormData = Pick<
  Service,
  "title" | "description" | "price" | "duration_minutes" | "service_type"
>;

export default function EditServiceModal({
  isOpen,
  service,
  onClose,
  onServiceUpdated,
}: EditServiceModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormData>({
    defaultValues: {
      title: service.title,
      description: service.description,
      price: service.price,
      duration_minutes: service.duration_minutes,
      service_type: service.service_type,
    },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit: SubmitHandler<ServiceFormData> = async (data) => {
    setServerError(null);
    try {
      const serviceData = {
        ...data,
        price: parseFloat(String(data.price)),
        duration_minutes: parseInt(String(data.duration_minutes), 10),
      };
      const response = await apiUpdateService(service.id, serviceData);
      onServiceUpdated(response.data);
      reset(serviceData);
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = extractErrorMessage(err.response?.data?.detail);
        setServerError(message);
      } else {
        setServerError(
          "An unexpected error occurred. Failed to update service.",
        );
      }
      console.error("Service update error:", err);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center transition-opacity">
      <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white transform transition-transform duration-200">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Edit Service
          </h3>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-2 px-7 py-3 space-y-4 text-left"
          >
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700"
              >
                Service Title
              </label>
              <input
                type="text"
                id="title"
                {...register("title", {
                  required: "Service title is required",
                })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.title && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700"
              >
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                {...register("description", {
                  required: "Description is required",
                })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="service_type"
                className="block text-sm font-medium text-gray-700"
              >
                Service Type
              </label>
              <select
                id="service_type"
                {...register("service_type", {
                  required: "Service type is required",
                })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="Live Performance">Live Performance</option>
                <option value="Virtual Appearance">Virtual Appearance</option>
                <option value="Personalized Video">Personalized Video</option>
                <option value="Custom Song">Custom Song</option>
                <option value="Other">Other</option>
              </select>
              {errors.service_type && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.service_type.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="price"
                className="block text-sm font-medium text-gray-700"
              >
                Price ($)
              </label>
              <input
                type="number"
                id="price"
                step="0.01"
                {...register("price", {
                  required: "Price is required",
                  valueAsNumber: true,
                  min: { value: 0, message: "Price cannot be negative" },
                })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.price && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.price.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="duration_minutes"
                className="block text-sm font-medium text-gray-700"
              >
                Duration (minutes)
              </label>
              <input
                type="number"
                id="duration_minutes"
                {...register("duration_minutes", {
                  required: "Duration is required",
                  valueAsNumber: true,
                  min: {
                    value: 1,
                    message: "Duration must be at least 1 minute",
                  },
                })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.duration_minutes && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.duration_minutes.message}
                </p>
              )}
            </div>

            {serverError && (
              <p className="text-sm text-red-600">{serverError}</p>
            )}

            <div className="items-center px-4 py-3 space-x-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-brand text-white text-base font-medium rounded-md w-auto shadow-sm hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  reset();
                  setServerError(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-base font-medium rounded-md w-auto shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
