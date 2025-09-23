Cloudflare R2 Integration (Attachments)

Overview
- Chat/media uploads now go direct-to-R2 using presigned URLs.
- The API returns signed GET links in message responses when attachments are stored in a private bucket.

Environment
Set these in your deployment (Fly.io, Render, etc.). Do not commit secrets.

- R2_ACCOUNT_ID=... (e.g., 9bd25cd5b1880987ed1421fb0341d91c)
- R2_ACCESS_KEY_ID=...
- R2_SECRET_ACCESS_KEY=...
- R2_BUCKET=booka-storage
- R2_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com (or EU endpoint)
- R2_PUBLIC_BASE_URL=https://media.booka.co.za
- R2_PRESIGN_UPLOAD_TTL=3600 (optional, seconds)
- R2_PRESIGN_DOWNLOAD_TTL=604800 (optional, seconds)

API
- POST /api/v1/booking-requests/{id}/attachments/presign
  Body: { kind: voice|video|image|file, filename, content_type, size }
  Returns: { key, put_url, get_url, public_url, headers, upload_expires_in, download_expires_in }

Behavior
- Frontend uploads to put_url with the correct Content-Type.
- Messages store public_url (canonical). The API signs this URL on read so clients can view private media.

Notes
- Ensure R2 CORS policy includes your frontend/admin origins and allows GET/HEAD/PUT with headers: Content-Type, Origin, Range, Content-MD5.
- Configure DNS + custom domain (e.g., media.booka.co.za) on the bucket.

