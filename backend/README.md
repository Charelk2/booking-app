# Backend

## Security Headers Middleware

The API adds standard security headers to every response via
`app/middleware/security_headers.py`. The middleware is enabled in
`app/main.py` and sets the following headers:

- `Content-Security-Policy: default-src 'self'`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `X-Frame-Options: DENY`

Deployment configs such as the `Dockerfile` expose matching environment
variables so reverse proxies or additional servers can mirror these
headers.

## NLP Booking

The booking request parser uses the **spaCy** `en_core_web_sm` model to
identify dates, locations, guest counts, and event types from natural
language descriptions. The service lives in `app/services/nlp_booking.py`
and is accessed via `/api/v1/booking-requests/parse`.

Common booking terms like event types and guest count labels are
normalized with Python's `difflib` before spaCy parsing. This lightweight
correction handles typos such as "frstival" → "Festival" or "guesds" →
"guests" so malformed requests can still be parsed.

### Dependencies

The following packages were added to `requirements.txt`:

- `spacy` (and the `en_core_web_sm` model)
- `dateparser`

Install the model after installing dependencies:

```bash
python -m spacy download en_core_web_sm
```

If the model fails to load, the API responds with `503` and logs the
underlying error.

## Database schema helpers

Startup checks in `app/db_utils.py` backfill missing database columns. This includes
an automatic migration that adds the `media_url` column to the `services` table when
running against older databases, preventing runtime errors when querying services
without this field.

## Artist search

The `/api/v1/artist-profiles/` endpoint returns an empty list when a `category`
query parameter is provided but no matching `ServiceCategory` exists. This
ensures that irrelevant artists are not shown when a category has no services.
Additionally, when a valid `category` is supplied, only artists with at least
one service in that category are returned so legacy providers without
category-specific offerings are excluded. When the category is `DJ`, the API
also filters out legacy artist records whose business name matches the user's
first and last name so that only bona fide DJ businesses appear in search
results.

