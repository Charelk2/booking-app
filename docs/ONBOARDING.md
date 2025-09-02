# Onboarding Guide

This guide walks new users through securing their accounts with two-factor authentication (2FA).

1. **Register and log in.** Once logged in, visit `/security` to manage 2FA settings.
2. **Enable 2FA.** Start the setup process, scan the generated QR code in your authenticator app, then verify the code. Recovery codes will be displayed—store them somewhere safe.
3. **Disable 2FA.** If you lose access to your authenticator, use a recovery code to disable 2FA at `/security/disable`.

Enabling MFA greatly reduces the risk of unauthorized access. Keep your recovery codes secure and regenerate them periodically.

## Quickstart Booking Walkthrough

These sample commands demonstrate the basic booking flow using the API. Replace `CLIENT_TOKEN`, `ARTIST_TOKEN`, `ARTIST_ID`, `SERVICE_ID`, `REQUEST_ID`, and `QUOTE_ID` with actual values from your environment. Set `PAYMENT_GATEWAY_FAKE=1` when testing locally so payments use the built-in fake gateway. Configure `PAYMENT_GATEWAY_URL` to point at your real payment processor; the default `https://example.com` only serves as a placeholder.

1. **Create users**
   ```bash
   curl -X POST http://localhost:8000/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"email":"client@example.com","password":"pass","user_type":"client"}'
   curl -X POST http://localhost:8000/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"email":"provider@example.com","password":"pass","user_type":"service_provider"}'
   ```
   Log in via `/auth/login` to obtain `CLIENT_TOKEN` and `ARTIST_TOKEN`.

2. **Service provider creates a service**
   ```bash
   curl -X POST http://localhost:8000/api/v1/services/ \
     -H "Authorization: Bearer ARTIST_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"name":"Acoustic Set","price":250}'
   ```

3. **Client submits a booking request**
   ```bash
   curl -X POST http://localhost:8000/api/v1/booking-requests/ \
     -H "Authorization: Bearer CLIENT_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"artist_id":ARTIST_ID,"service_id":SERVICE_ID,"event_date":"2025-12-25","message":"Please perform"}'
   ```

4. **Service provider sends a quote**
   ```bash
   curl -X POST http://localhost:8000/api/v1/booking-requests/REQUEST_ID/quotes \
     -H "Authorization: Bearer ARTIST_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"booking_request_id":REQUEST_ID,"amount":500}'
   ```
   This updates the booking request status to `quote_provided` and creates a
   `SYSTEM` message in the client's chat prompting them to review and accept
   the quote. The message expires in 7 days.

5. **Client accepts the quote**
   ```bash
   curl -X PUT http://localhost:8000/api/v1/quotes/QUOTE_ID/client \
     -H "Authorization: Bearer CLIENT_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"status":"accepted_by_client"}'
   ```

6. **Pay using the fake gateway (full upfront)**
   ```bash
   PAYMENT_GATEWAY_FAKE=1 curl -X POST http://localhost:8000/api/v1/payments \
     -H "Authorization: Bearer CLIENT_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"booking_request_id":REQUEST_ID}'
   ```

   If testing entirely in the browser, set `NEXT_PUBLIC_FAKE_PAYMENTS=1` in
   `frontend/.env.local` so the payment modal succeeds without hitting the
   API.

7. **Check your bookings**
   ```bash
   curl -H "Authorization: Bearer CLIENT_TOKEN" \
     http://localhost:8000/api/v1/bookings/my-bookings
   ```

9. **Export or delete your account**
   ```bash
   # Download a JSON export
   curl -H "Authorization: Bearer CLIENT_TOKEN" \
     http://localhost:8000/api/v1/users/me/export

   # Delete the account after confirming the password
   curl -X DELETE http://localhost:8000/api/v1/users/me \
     -H "Authorization: Bearer CLIENT_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"password":"pass"}'
   ```

8. **Run database migrations**
   ```bash
   alembic upgrade head
   ```
   This includes the new migration for creating the `reviews` table.
