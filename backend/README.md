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
