import * as React from 'react';
import { IconButton, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { useRecordContext } from 'react-admin';
import CodeIcon from '@mui/icons-material/Code';

export default function JsonButton({ value, source, title = 'Details' }: { value?: any | ((rec:any)=>any); source?: string; title?: string }) {
  const [open, setOpen] = React.useState(false);
  const rec = useRecordContext<any>();
  let v: any = value;
  if (typeof value === 'function') v = value(rec);
  if (v === undefined && source) v = rec?.[source];
  return (
    <>
      <IconButton size="small" onClick={() => setOpen(true)} aria-label="view json"><CodeIcon fontSize="small"/></IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
            {JSON.stringify(v ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
