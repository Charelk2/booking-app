import * as React from 'react';
import { Button } from 'react-admin';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';

type ConfirmButtonProps = {
  label: string;
  confirmTitle?: string;
  confirmContent?: React.ReactNode;
  confirmPlaceholder?: string;
  confirmTextRequired?: string; // when provided, input must match
  onConfirm: (inputValue?: string) => Promise<void> | void;
  color?: 'primary' | 'error' | 'inherit' | 'secondary' | 'success' | 'info' | 'warning';
  variant?: 'text' | 'outlined' | 'contained';
};

export default function ConfirmButton({
  label,
  confirmTitle = 'Please confirm',
  confirmContent,
  confirmPlaceholder,
  confirmTextRequired,
  onConfirm,
  color = 'primary',
  variant = 'outlined',
}: ConfirmButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const disabled = !!confirmTextRequired && value.trim() !== confirmTextRequired.trim();

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      await onConfirm(value);
      setOpen(false);
      setValue('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button label={label} color={color} variant={variant} onClick={() => setOpen(true)} />
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{confirmTitle}</DialogTitle>
        <DialogContent>
          <div style={{ marginTop: 8, color: '#555' }}>{confirmContent}</div>
          {confirmTextRequired !== undefined && (
            <TextField
              autoFocus
              margin="dense"
              fullWidth
              placeholder={confirmPlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button label="Cancel" onClick={() => setOpen(false)} />
          <Button label="Confirm" onClick={handleConfirm} disabled={submitting || disabled} color={color} />
        </DialogActions>
      </Dialog>
    </>
  );
}

