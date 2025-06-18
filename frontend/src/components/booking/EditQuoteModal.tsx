import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import type { Quote } from '@/types';

interface EditQuoteModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { quote_details: string; price: number }) => Promise<void> | void;
  quote: Quote;
}

const EditQuoteModal: React.FC<EditQuoteModalProps> = ({ open, onClose, onSubmit, quote }) => {
  const [details, setDetails] = useState(quote.quote_details ?? '');
  const [price, setPrice] = useState<string>(quote.price !== undefined ? quote.price.toString() : '');
  const modalRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (open) {
      setDetails(quote.quote_details ?? '');
      setPrice(quote.price !== undefined ? quote.price.toString() : '');
    }
  }, [open, quote]);

  useEffect(() => {
    if (!open || !modalRef.current) return undefined;
    const modal = modalRef.current;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            (last || first).focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          (first || last).focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', trap);
    (first || modal).focus();
    return () => {
      document.removeEventListener('keydown', trap);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        ref={modalRef}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          onSubmit({
            quote_details: String(data.get('details') ?? ''),
            price: Number(data.get('price') ?? 0),
          });
        }}
        className="bg-white rounded-lg shadow-lg w-full max-w-sm p-4 mx-2"
      >
        <h2 className="text-lg font-medium mb-2">Edit Quote</h2>
        <div className="space-y-2">
          <label className="flex flex-col text-sm">
            Details
            <textarea
              name="details"
              className="w-full border rounded p-1"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          <label className="flex flex-col text-sm">
            Price
            <input
              name="price"
              type="number"
              className="w-full border rounded p-1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </div>
  );
};

export default EditQuoteModal;
