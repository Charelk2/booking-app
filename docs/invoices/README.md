# Invoices: Provider, Booka Tax & API Wiring

This doc explains how invoices work across the backend and frontend, how provider vs Booka tax invoices are created and exposed, and what we fixed to make `/invoices/{id}` work reliably in production.

---

## 1. Invoice Types & Storage

- **DB table:** `invoices`
- **Key columns:**
  - `id` – primary key
  - `quote_id` – links to `quotes_v2.id`
  - `booking_id` – links to `bookings_simple.id` (not the formal `bookings.id`)
  - `client_id`, `artist_id`
  - `amount_due`, `status` (`invoicestatus` enum)
  - `invoice_type` (string), `pdf_url` (optional R2 public URL)
- **Invoice types (string values):**
  - `provider_tax` – main provider invoice incl. supplier VAT (`create_provider_invoice`)
  - `provider_invoice` – non-VAT variant when supplier is not a vendor
  - `client_fee_tax` – Booka tax invoice for the platform fee (`create_client_fee_invoice`)
  - `commission_tax` – internal commission invoice for agent payouts

The `booking_id` on `invoices` always points at **`bookings_simple.id`**, while the formal booking that the UI uses lives in `bookings.id`. The API layer bridges these via `quote_id`.

---

## 2. Backend Flow

### 2.1 Models & CRUD

- `backend/app/models/invoice.py`
  - Defines `Invoice`, `InvoiceStatus`, `InvoiceType`.
- `backend/app/crud/crud_invoice.py`
  - `create_invoice_from_quote(db, quote, booking_simple)`  
    - Creates a single legacy invoice for the quote total (no `invoice_type`).
  - `create_provider_invoice(db, booking_simple, vendor=True)`  
    - Idempotently creates a `provider_tax`/`provider_invoice` for a booking.
  - `create_commission_invoice(db, booking_simple)`  
    - Creates an internal `commission_tax` invoice.
  - `create_client_fee_invoice(db, booking_simple)`  
    - Creates a `client_fee_tax` (Booka tax) invoice for the client fee.  
    - Uses `CLIENT_FEE_RATE`, `VAT_RATE`, and `BOOKA_VAT_NUMBER` env vars.
  - `get_invoice_by_booking_and_type(db, booking_simple_id, type_key)`  
    - Resolves the latest invoice for a given `booking_simple.id` and logical type:
      - `provider` → `provider_tax`/`provider_invoice`
      - `client_fee` → `client_fee_tax`
      - `commission` → `commission_tax`

### 2.2 Creation Triggers

- **Quote acceptance (`accept_quote`)** – `backend/app/crud/crud_quote_v2.py`
  - Creates `BookingSimple` + formal `Booking` and a **legacy** invoice via `create_invoice_from_quote`. This is pre–split-invoicing.
- **Payment verification (`/payments/paystack/verify`)** – `backend/app/api/api_payment.py`
  - After a successful Paystack verify:
    - Ensures a `provider_tax` / `provider_invoice` exists for the `BookingSimple`:
      - `crud_invoice.create_provider_invoice(db, simple, vendor=is_vendor)`
    - When `settings.ENABLE_SPLIT_INVOICING` is true, also ensures a `client_fee_tax` (Booka tax) invoice exists:
      - `crud_invoice.create_client_fee_invoice(db, simple)` (idempotent).
    - Generates a PDF receipt for the **payment** (not the invoice) and uploads it to R2.
- **Paystack webhook (`/payments/paystack/webhook`)**
  - Mirrors the verify logic:
    - Ensures provider invoice exists.
    - When split invoicing is enabled, ensures Booka client-fee invoice exists.

`create_client_fee_invoice` remains exposed via the invoice API for finance/ops to backfill or repair specific bookings, but new successful payments will now automatically get both a provider invoice and a Booka tax invoice when `ENABLE_SPLIT_INVOICING=1`.

---

## 3. Invoice API

File: `backend/app/api/api_invoice.py`

- `GET /api/v1/invoices/{invoice_id}`
  - Returns `schemas.InvoiceRead`.
  - 404 if invoice missing.
  - 403 if the current user is neither the `client` nor `artist`, and not an admin.
- `POST /api/v1/invoices/{invoice_id}/mark-paid`
  - Marks an invoice as paid and sets `payment_method` / `notes`.
- `GET /api/v1/invoices/{invoice_id}/pdf`
  - Authenticated as above.
  - If `invoice.pdf_url` is set and points at R2, returns a 307 redirect to a presigned URL.
  - Otherwise renders a PDF using the appropriate renderer:
    - `provider_tax` / `provider_invoice` → `services/provider_invoice_pdf.py`
    - `client_fee_tax` → `services/client_fee_invoice_pdf.py`
    - `commission_tax` → `services/commission_invoice_pdf.py`
    - Fallback → `services/invoice_pdf.py`
  - Uploads the PDF to R2 and sets `invoice.pdf_url` for future fast access.
- `GET /api/v1/invoices/by-booking/{booking_id}?type=provider|client_fee|commission`
  - Resolves from formal `Booking.id` → `BookingSimple.id` → `Invoice`.
  - Response model: `schemas.InvoiceByBooking` (includes both `booking_id` and `booking_simple_id`).
  - 404 if booking, booking_simple, or the requested invoice type is missing.
  - 403 if current user is neither the client nor artist and not admin.
- `GET /api/v1/invoices/by-quote/{quote_id}`
  - Returns the latest invoice tied to a `QuoteV2`.
- `POST /api/v1/invoices/provider/{booking_simple_id}`
  - Admin/artist helper to explicitly create a provider invoice.
- `POST /api/v1/invoices/client-fee/{booking_simple_id}`
  - Admin-only helper to create a Booka tax (client-fee) invoice for a booking.

**Router mount:**  
Invoice routes are mounted in `backend/app/main.py`:

```python
if os.getenv("OPENAPI_MINIMAL", "0") != "1":
    from .api import api_invoice
    app.include_router(
        api_invoice.router,
        prefix=f"{api_prefix}/invoices",
        tags=["invoices"],
    )
```

If importing `api_invoice` fails, the router is silently skipped.

---

## 4. Booking Visibility & `visible_invoices`

To avoid extra calls from the frontend, booking endpoints attach a `visible_invoices` array to booking responses.

File: `backend/app/api/api_booking.py`

- For each booking, the API:

  ```python
  invs = (
      db.query(models.Invoice)
      .filter(models.Invoice.booking_id == int(bs_id))
      .order_by(models.Invoice.id.asc())
      .all()
  )
  vis = [
      {
          "type": (getattr(iv, "invoice_type", None) or "").lower() or "unknown",
          "id": int(iv.id),
          "pdf_url": getattr(iv, "pdf_url", None),
          "created_at": getattr(iv, "created_at", getattr(iv, "updated_at", booking.created_at)),
      }
      for iv in invs
  ]
  setattr(booking, "visible_invoices", vis)
  ```

- The corresponding schema is `VisibleInvoice` in `backend/app/schemas/booking.py`, and `BookingResponse.visible_invoices` is optional.

This is what the frontend uses to decide which invoice links to show.

---

## 5. Frontend Flow

### 5.1 Edge route: `/invoices/[id]`

File: `frontend/src/app/invoices/[id]/route.ts`

- Accepts `GET /invoices/{id}`.
- Forwards the caller’s `cookie` header to:

  ```ts
  const url = `${apiBase()}/api/v1/invoices/${id}/pdf`;
  const resp = await fetch(url, { method: 'GET', headers: { cookie } });
  ```

- Behaviour:
  - 401/403 → redirect to `/login?next=/invoices/{id}`.
  - Non-OK 404:
    - If `booking_id` query param is present, tries the fallback:

      ```ts
      const altUrl = `${apiBase()}/api/v1/invoices/by-booking/${bookingId}?type=provider`;
      ```

      and, if successful, redirects to `/invoices/{newId}`.
    - Otherwise returns `Invoice unavailable` with the backend status.
  - OK → streams the PDF back as `application/pdf`.

### 5.2 Booking Summary – Provider & Booka Tax Invoice links

File: `frontend/src/components/chat/BookingSummaryCard.tsx:320`

- Provider invoice link:
  - Always available to both client and artist once the booking is paid/confirmed.
  - Logic:
    - Prefer `visible_invoices` entry with `type === 'provider_tax' || 'provider_invoice'`.
    - Else use `bookingDetails.invoice_id`.
    - Else fall back to `/invoices/by-booking/{bookingId}?type=provider`.
  - Label: “Download Provider Invoice”.

- **Booka tax invoice (client-fee) link – client only:**
  - New link rendered **only for client users** (`user.user_type === 'client'`).
  - Only shown when:
    - Booking is paid/confirmed, **and**
    - `visible_invoices` contains an entry with `type === 'client_fee_tax'`.
  - It links to `/invoices/{client_fee_invoice_id}` – no fallback:
    - If there’s no `client_fee_tax` invoice row yet, the link is not shown.
  - Label: “Download Booka Tax Invoice”.

This avoids exposing a “Booka tax invoice” link when there is no `client_fee_tax` invoice generated yet for that booking (to prevent 404s).

---

## 6. Production Bug & Fix (Nov 2025)

### 6.1 Symptom

- All calls to:
  - `GET https://api.booka.co.za/api/v1/invoices/{id}`
  - `GET https://api.booka.co.za/api/v1/invoices/{id}/pdf`
  - `GET https://api.booka.co.za/api/v1/invoices/by-booking/{booking_id}?type=...`
  returned `{"detail": "Not Found"}` (FastAPI default 404).
- The database clearly contained invoice rows (e.g., id 65 with `invoice_type='provider_tax'` and `status='paid'`).
- `GET https://booka.co.za/invoices/{id}` rendered “Invoice unavailable”.

### 6.2 Root Cause

- In `backend/app/api/api_invoice.py`, the `by-booking` endpoint referenced `schemas.InvoiceByBooking` as its `response_model`.
- The `InvoiceByBooking` schema is defined in `backend/app/schemas/invoice.py`, but **was not exported** from `backend/app/schemas/__init__.py`.
- When importing `app.api.api_invoice`, Python raised an `AttributeError` during module import (because `schemas.InvoiceByBooking` did not exist on the `schemas` module).
- In `backend/app/main.py`, the invoice router is mounted inside a `try/except`:

  ```python
  try:
      from .api import api_invoice
      app.include_router(
          api_invoice.router,
          prefix=f"{api_prefix}/invoices",
          tags=["invoices"],
      )
  except Exception:
      pass
  ```

  so the import failure was swallowed, and the whole invoice router was skipped.

### 6.3 Fix

1. **Export `InvoiceByBooking`**

   File: `backend/app/schemas/__init__.py`

   - Add `InvoiceByBooking` to the import:

     ```python
     from .invoice import InvoiceRead, InvoiceMarkPaid, InvoiceByBooking
     ```

   - Add it to `__all__`:

     ```python
     "InvoiceRead",
     "InvoiceMarkPaid",
     ...
     "ServiceCategoryResponse",
     "InvoiceByBooking",
     ]
     ```

2. **Redeploy backend**

   - After redeploying `booka-api-charel`, listing routes on the VM shows:

     ```text
     /api/v1/invoices/{invoice_id}
     /api/v1/invoices/{invoice_id}/mark-paid
     /api/v1/invoices/{invoice_id}/pdf
     /api/v1/invoices/by-booking/{booking_id}
     /api/v1/invoices/by-quote/{quote_id}
     /api/v1/invoices/provider/{booking_id}
     /api/v1/invoices/commission/{booking_id}
     /api/v1/invoices/client-fee/{booking_id}
     /api/v1/invoices/booking/{booking_id}/client-billing
     /api/v1/invoices/booking-request/{booking_request_id}/client-billing
     ```

3. **BookingSummaryCard client-fee link**

   - The “Download Booka Tax Invoice” link now:
     - Only renders for clients.
     - Only renders when `visible_invoices` already includes a `client_fee_tax` entry for that booking.
     - No longer falls back to `/invoices/by-booking/{bookingId}?type=client_fee` when there is no client-fee invoice, avoiding 404s from the link.

---

## 7. Tests

Backend tests live under `backend/tests/`.

- **`backend/tests/test_invoice.py`**
  - `test_invoice_created_and_api`
    - Accepts a quote, ensures an invoice is created and:
      - `GET /api/v1/invoices/{id}` returns JSON with `invoice_type`.
      - `POST /api/v1/invoices/{id}/mark-paid` updates `status` to `paid`.
      - `GET /api/v1/invoices/{id}/pdf` returns a PDF.
  - `test_invoice_idempotency_by_type`
    - Verifies `create_client_fee_invoice` and `create_commission_invoice` are idempotent per booking.
  - `test_invoice_by_booking_provider_and_client_fee` **(added for this work)**
    - Accepts a quote → creates `BookingSimple` + `Booking`.
    - Creates both provider and client-fee invoices for the booking.
    - As the client user:
      - `GET /api/v1/invoices/by-booking/{booking.id}?type=provider`:
        - Returns the provider invoice and both `booking_id` and `booking_simple_id`.
      - `GET /api/v1/invoices/by-booking/{booking.id}?type=client_fee`:
        - Returns the client-fee (Booka tax) invoice with `invoice_type == "client_fee_tax"`.
      - `GET /api/v1/invoices/by-booking/{booking.id}?type=commission`:
        - Returns 404 when no commission invoice exists.

These tests ensure the router mounts correctly, the `InvoiceByBooking` schema is wired, and the by-booking resolution for provider and Booka tax invoices behaves as expected.
