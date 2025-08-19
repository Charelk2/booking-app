import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { BottomSheet } from '../ui';
import type { Quote } from '@/types';

interface EditQuoteModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { quote_details: string; price: number }) => Promise<void> | void;
  quote: Quote;
}

const EditQuoteModal: React.FC<EditQuoteModalProps> = ({ open, onClose, onSubmit, quote }) => {
  const [details, setDetails] = useState(quote.quote_details ?? '');
  const [price, setPrice] = useState<string>(
    quote.price !== undefined ? quote.price.toString() : '',
  );
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDetails(quote.quote_details ?? '');
      setPrice(quote.price !== undefined ? quote.price.toString() : '');
    }
  }, [open, quote]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      initialFocus={firstFieldRef}
      testId="edit-quote-modal"
      desktopCenter
      panelClassName="md:max-w-sm md:mx-auto"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          onSubmit({
            quote_details: String(data.get('details') ?? ''),
            price: Number(data.get('price') ?? 0),
          });
        }}
        className="flex flex-col p-4 max-h-[90vh] md:max-h-none min-h-0"
      >
        <h2 className="text-lg font-medium mb-2">Edit Quote</h2>
        <div className="space-y-2 flex-1 overflow-y-auto">
          <label className="flex flex-col text-sm">
            Details
            <textarea
              ref={firstFieldRef}
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
    </BottomSheet>
  );
};

export default EditQuoteModal;
