"use client";
import React, { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Bars3Icon } from "@heroicons/react/24/outline";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Service } from "@/types";
import { Button } from "@/components/ui";
import Section from "@/components/ui/Section";
import IllustratedEmpty from "@/components/ui/IllustratedEmpty";

type ServiceCardProps = {
  service: Service;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  style?: React.CSSProperties;
  isDragging?: boolean;
  onEdit: (service: Service) => void;
  onDelete: (id: number) => void;
};

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'approved') return null;
  const label = status === 'pending_review' ? 'Awaiting approval' : status === 'rejected' ? 'Rejected' : status === 'draft' ? 'Draft' : status;
  const colors = status === 'pending_review' ? 'bg-yellow-50 text-yellow-700 ring-yellow-200' : status === 'rejected' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-gray-100 text-gray-700 ring-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ${colors}`}>
      {label}
    </span>
  );
}

function ServiceCard({ service, dragHandleProps, style, isDragging, onEdit, onDelete }: ServiceCardProps) {
  return (
    <div
      style={style}
      className={clsx(
        "relative p-4 md:p-5 rounded-2xl bg-white border border-gray-200 shadow-sm transition hover:shadow-md",
        isDragging && "ring-2 ring-brand-light/40",
      )}
    >
      <div className="absolute right-2 top-2 cursor-grab active:cursor-grabbing text-gray-400 touch-none z-10" aria-hidden="true" {...dragHandleProps}>
        <Bars3Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium mb-1 text-gray-900 truncate">{service.title}</h4>
            <StatusBadge status={(service as any).status} />
          </div>
          <p className="text-sm text-gray-600 line-clamp-2">{service.description}</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{Number(service.price).toLocaleString(undefined, { style: "currency", currency: "ZAR" })}</p>
        </div>
        <div className="flex flex-col items-end gap-2 mt-3 sm:mt-0">
          <button type="button" onClick={() => onEdit(service)} className="text-sm text-brand-primary hover:underline">
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete this service? This action cannot be undone.")) onDelete(service.id);
            }}
            className="text-sm text-gray-500 hover:text-red-500"
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableServiceCard({ service, onEdit, onDelete }: { service: Service; onEdit: (s: Service) => void; onDelete: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: service.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 100 : "auto", opacity: isDragging ? 0.8 : 1 } as React.CSSProperties;
  return (
    <div ref={setNodeRef} data-testid="service-item">
      <ServiceCard service={service} onEdit={onEdit} onDelete={onDelete} dragHandleProps={{ ...attributes, ...listeners }} style={style} isDragging={isDragging} />
    </div>
  );
}

type Props = {
  services: Service[];
  onReorder: (ordered: Service[]) => Promise<void> | void;
  onAdd: () => void;
  onEdit: (svc: Service) => void;
  onDelete: (id: number) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};

import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import ErrorState from "@/components/ui/ErrorState";

const ServicesSection: React.FC<Props> = ({ services, onReorder, onAdd, onEdit, onDelete, loading, error, onRetry }) => {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const [isReordering, setIsReordering] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const hintTimer = useRef<NodeJS.Timeout | null>(null);

  const items = useMemo(() => services, [services]);

  const handleDragStart = () => {
    setIsReordering(true);
    setShowHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setShowHint(false), 1500);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsReordering(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);
    const ordered = arrayMove(items, oldIndex, newIndex);
    onReorder(ordered);
  };

  if (loading) return <Section title="Your Services" subtitle="Manage what you offer and display order" className="mb-10"><LoadingSkeleton lines={6} /></Section>;

  if (error) return <Section title="Your Services" subtitle="Manage what you offer and display order" className="mb-10"><ErrorState message={error} onRetry={onRetry} /></Section>;

  return (
    <Section title="Your Services" subtitle="Manage what you offer and display order" className="mb-10">
      {isReordering && showHint && (
        <div className="text-sm text-gray-600 mb-2" role="status">Drag to reorder</div>
      )}
      {services.length === 0 ? (
        <IllustratedEmpty
          variant="services"
          title="No services yet"
          description="Add your first service to start receiving booking requests. You can reorder them later."
          action={<Button onClick={onAdd}>Add Service</Button>}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={services.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((service) => (
                <SortableServiceCard key={service.id} service={service} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <Button type="button" onClick={onAdd} className="mt-4 sm:w-auto" fullWidth>
        Add Service
      </Button>
    </Section>
  );
};

export default ServicesSection;
