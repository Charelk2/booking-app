import * as React from 'react';
import { Card, CardContent, Stack, Typography, Button, TextField } from '@mui/material';
import { Title, useDataProvider, useNotify } from 'react-admin';

export default function PayoutsRun() {
  const dp: any = useDataProvider();
  const notify = useNotify();
  const [bookingIds, setBookingIds] = React.useState('');

  const createBatch = async () => {
    const ids = bookingIds.split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) return notify('Add booking IDs (comma-separated)', { type:'warning' });
    try {
      await (dp as any).createPayoutBatch({ bookingIds: ids });
      notify('Payout batch created', { type:'info' });
      setBookingIds('');
    } catch (e:any) {
      notify(e.message || 'Failed to create batch', { type:'warning' });
    }
  };

  return (
    <>
      <Title title="Create Payout Batch" />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Create Payout Batch</Typography>
            <Typography variant="body2" color="text.secondary">
              Paste one or more eligible Booking IDs (comma-separated). The backend will compute provider nets,
              group by payee, and initiate disbursement via your payout rail.
            </Typography>
            <TextField
              label="Booking IDs"
              placeholder="bk_123, bk_456, bk_789"
              value={bookingIds}
              onChange={(e)=>setBookingIds(e.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={createBatch}>Create Batch</Button>
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}

