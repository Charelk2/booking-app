WebSocket (WS) reverse proxy configuration

This app authenticates WebSocket connections using the Sec-WebSocket-Protocol header
with a bearer token subprotocol ("bearer, <JWT>"). Your reverse proxy must forward
this header and allow WS upgrades.

NGINX example

  map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
  }

  server {
    server_name api.booka.co.za;

    location /api/v1/ws {
      proxy_pass http://backend_upstream;
      proxy_http_version 1.1;

      # WebSocket upgrade
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;

      # Forward subprotocol so backend can negotiate 'bearer' and read the token
      proxy_set_header Sec-WebSocket-Protocol $http_sec_websocket_protocol;

      # Preserve identity and context
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # Long-lived socket timeouts; no buffering for WS
      proxy_read_timeout 3600s;
      proxy_send_timeout 60s;
      proxy_buffering off;
    }
  }

Notes

- If you run behind a CDN (Cloudflare, etc.), enable WebSockets and ensure the
  Sec-WebSocket-Protocol header is allowed through.
- For Traefik/Caddy/Ingress, configure equivalent upgrade and header forwarding.
- The backend will accept with subprotocol 'bearer' when advertised and extract
  the token from the Sec-WebSocket-Protocol header or, as a fallback, from
  the query parameter `?token=` during migration.

