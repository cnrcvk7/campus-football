# Production Deployment Guide

## Architecture overview

```
Internet
    │  HTTPS (TLS terminated here)
    ▼
External reverse proxy / load balancer
    │  HTTP  → frontend:80
    ▼
frontend  (nginx:1.27-alpine, port 80)
    │  Serves:  React SPA static files from /usr/share/nginx/html
    │  Proxies: /api/* → http://backend:8000  (internal network)
    ▼
backend   (gunicorn, port 8000 — internal only, not published)
    │  Django REST Framework API
    ▼
db        (postgres:16-alpine, port 5432 — internal only, not published)
```

**Single public ingress:** only the `frontend` container publishes a port (`:80`).
The backend and database are reachable only on the internal Docker network.
TLS termination must happen at the external reverse proxy layer.

---

## Required environment variables

All variables below must be present in `.env.prod` (or injected by your secret manager) before starting the production stack.

### Django

| Variable | Description | How to generate |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django signing key (CSRF, sessions) | `python -c "import secrets; print(secrets.token_hex(50))"` |
| `JWT_SIGNING_KEY` | Dedicated JWT signing key — **must differ from `DJANGO_SECRET_KEY`** | `python -c "import secrets; print(secrets.token_hex(50))"` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames Django will serve | `app.example.com,www.example.com` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated scheme+host CORS origins | `https://app.example.com` |
| `DJANGO_SETTINGS_MODULE` | Must be `config.settings.production` | set in `docker-compose.prod.yml` |

### Database

| Variable | Description |
|---|---|
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password — use a strong random value |
| `POSTGRES_HOST` | Hostname of the database service (`db` inside Docker) |
| `POSTGRES_PORT` | PostgreSQL port (default `5432`) |

---

## Generating secret keys safely

Run this command **twice** — once for `DJANGO_SECRET_KEY` and once for `JWT_SIGNING_KEY` — and store each value separately:

```bash
python -c "import secrets; print(secrets.token_hex(50))"
```

The two keys must be different values. Store them directly in your secret manager or `.env.prod`. **Never log them, commit them, or print them in CI output.**

---

## First-time deployment

```bash
# 1. Copy the example and fill in every value
cp .env.prod.example .env.prod   # create this from the table above

# 2. Build and start
docker compose -f docker-compose.prod.yml up -d --build

# 3. Verify backend started cleanly
docker compose -f docker-compose.prod.yml logs backend

# 4. Verify frontend is serving the SPA
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# → 200

# 5. Verify the SPA fallback (client-side routing)
curl -s -o /dev/null -w "%{http_code}" http://localhost/players/some-uuid
# → 200  (nginx returns index.html; React Router handles the path)

# 6. Verify the API proxy
curl -s -o /dev/null -w "%{http_code}" http://localhost/api/core/health/
# → 200  (proxied through nginx to gunicorn)
```

The `command` in `docker-compose.prod.yml` runs `migrate`, `collectstatic`, then Gunicorn automatically on every start.

---

## Building and running the production stack locally

You can test the full production build on a developer machine without a real domain:

```bash
# Build both images (this runs `npm run build` inside the frontend container)
docker compose -f docker-compose.prod.yml build

# Start the stack in the foreground to see all logs
docker compose -f docker-compose.prod.yml up

# Or detached:
docker compose -f docker-compose.prod.yml up -d

# Tear down (preserves the postgres_data volume)
docker compose -f docker-compose.prod.yml down
```

The React app will be available at `http://localhost` (port 80).
The Django API is not directly accessible from the host — all `/api/` traffic
goes through the nginx proxy inside the `frontend` container.

---

## Updating the application

```bash
# Rebuild only the backend image (e.g. after a Django change)
docker compose -f docker-compose.prod.yml up -d --build --no-deps backend

# Rebuild only the frontend image (e.g. after a React change)
docker compose -f docker-compose.prod.yml up -d --build --no-deps frontend
```

---

## Reverse proxy requirement

`production.py` sets `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` and `SECURE_SSL_REDIRECT = True`.

**Your reverse proxy (nginx, Caddy, AWS ALB, etc.) must:**

1. Terminate TLS.
2. Forward **all** traffic (both static and `/api/`) to `frontend:80` — the nginx
   container is the single ingress.  Do not route `/api/` separately to the backend;
   the internal nginx proxy handles that split.
3. Set `X-Forwarded-Proto: https` on every forwarded request.
4. **Strip any client-supplied `X-Forwarded-Proto` header** before forwarding — otherwise a client can bypass the HTTPS check.

If your proxy does not set `X-Forwarded-Proto`, set `SECURE_PROXY_SSL_HEADER` to `None` and handle redirects at the proxy layer instead.

### Example external nginx upstream block

```nginx
upstream campus_football {
    server 127.0.0.1:80;   # or the Docker host IP / container name
}

server {
    listen 443 ssl;
    server_name app.example.com;

    ssl_certificate     /etc/ssl/certs/app.crt;
    ssl_certificate_key /etc/ssl/private/app.key;

    # Strip client-supplied proto header to prevent bypass
    proxy_set_header X-Forwarded-Proto "";
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    location / {
        proxy_pass http://campus_football;
    }
}

server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}
```

### Real client IP forwarding (required for rate limiting)

The login-rate throttle (`POST /api/auth/token/`) identifies clients by `REMOTE_ADDR`. **If your proxy does not forward the real client IP as `REMOTE_ADDR`, all users share a single throttle bucket** — five failed login attempts anywhere would lock out the login endpoint for everyone for one minute.

**nginx** — add to your `server` or `location` block:

```nginx
# Trust only the immediate upstream (your own proxy).
# Replace 172.18.0.0/16 with your actual Docker network CIDR.
set_real_ip_from 172.18.0.0/16;
real_ip_header   X-Forwarded-For;
real_ip_recursive on;
```

This replaces `REMOTE_ADDR` at the nginx level with the real client IP from the last untrusted hop in `X-Forwarded-For`, making the throttle work correctly. The `set_real_ip_from` + `real_ip_recursive` combination is what prevents IP spoofing — only hops from trusted CIDR ranges are walked. Also forward the header to upstream so Django can log it:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

**AWS ALB / Cloudflare** — the real client IP is appended to `X-Forwarded-For` by the load balancer. Django's `LoginRateThrottle` intentionally reads only `REMOTE_ADDR` and does not trust `X-Forwarded-For` (to prevent IP spoofing). For cloud load balancers, configure the load balancer to insert the real IP into a separate trusted header (e.g. `X-Real-IP`) or use a custom `get_ident()` that reads a header set exclusively by the load balancer.

---

## Periodic token table maintenance

With refresh-token rotation and blacklisting enabled, every login and every token refresh inserts a row into the `token_blacklist_outstandingtoken` table. Without pruning, this table grows without bound and degrades JWT validation performance over time.

Run `flushexpiredtokens` on a schedule to remove expired entries:

```bash
# Inside a running container:
docker compose -f docker-compose.prod.yml exec backend \
    python manage.py flushexpiredtokens

# Or add a cron job on the host:
# 0 3 * * * docker compose -f /path/to/docker-compose.prod.yml exec -T backend \
#     python manage.py flushexpiredtokens
```

A nightly run is sufficient for most workloads. The command is safe to run while the application is live.

---

## HSTS pre-load notice

`SECURE_HSTS_PRELOAD = True` is set, but **do not submit to hstspreload.org** until:

- HTTPS is stable and working on all subdomains.
- You are confident you will never need HTTP on this domain again.

HSTS pre-load is very difficult to undo.

---

## Frontend static serving

### How the production frontend image works

1. **Build stage** (`FROM node:20-alpine AS build`) — runs `npm ci && npm run build`
   inside the image; Vite emits a hashed bundle to `/app/dist`.
2. **Production stage** (`FROM nginx:1.27-alpine AS prod`) — copies `/app/dist`
   to `/usr/share/nginx/html`; no Node.js or source code is present in the final
   image.

### nginx behaviour (`frontend/nginx.conf`)

| Path pattern | Behaviour |
|---|---|
| `/api/*` | Proxied to `http://backend:8000` (internal Docker network) |
| `*.js`, `*.css`, fonts, images | Served with `Cache-Control: public, immutable; max-age=1y` — safe because Vite hashes filenames |
| `/index.html` | Served with `Cache-Control: no-store` — must always be fresh |
| Everything else | `try_files $uri $uri/ /index.html` — SPA fallback for client-side routing |

### Security headers applied

| Header | Value |
|---|---|
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | **Not set** — see note below |

**CSP note:** A Content-Security-Policy is intentionally absent.  Before adding one,
audit all resource origins used at runtime (API, fonts, scripts, inline styles from
Tailwind, etc.) and test against the application in a staging environment.  An
overly-restrictive CSP breaks the app silently in some browsers.

### TLS note

TLS termination is **not** handled inside the frontend container.  The nginx inside
the container listens on plain HTTP port 80.  Your external reverse proxy must
terminate HTTPS and forward to this port.  See _Reverse proxy requirement_ above.

---

## Development vs production comparison

| Setting | Development | Production |
|---|---|---|
| `DEBUG` | `True` (configurable) | `False` (hard-coded) |
| `SECRET_KEY` | Unsafe default allowed | Must be strong; placeholder rejected |
| `JWT_SIGNING_KEY` | Falls back to `SECRET_KEY` | Must be set; placeholder rejected |
| Access token lifetime | 15 minutes | 15 minutes |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Required from env |
| `SECURE_SSL_REDIRECT` | Off | On |
| Secure cookies | Off | On |
| CORS | `localhost:5173` hard-coded | From `CORS_ALLOWED_ORIGINS` env |
| Backend server | `runserver` | Gunicorn |
| Frontend server | Vite dev (HMR) | nginx + compiled bundle |
| Backend port exposed | Yes (host port 8000) | No (nginx proxies internally) |
| DB port exposed | Yes (host port 5433) | No |
| Source bind mount | Yes (hot reload) | No (immutable image) |
| API routing | Vite proxy | nginx `proxy_pass` to backend:8000 |

---

## Docker security notes

- The backend container runs as non-root user `appuser` (UID 1000).
- The frontend production image runs nginx with worker processes as the `nginx` user.
  The master process binds port 80 as root (required for privileged ports);
  request handling is done by the non-root worker processes.
- The database is not exposed to the host network in `docker-compose.prod.yml`.
- The backend is not exposed to the host network in `docker-compose.prod.yml`;
  it is only reachable from the nginx frontend container on the internal Docker network.
- `.dockerignore` prevents `.env` files, `.git`, and Python caches from being baked into the image.
- Secrets are injected at runtime via `env_file: .env.prod`, never at build time.
- The React build embeds no secrets — the API client uses a relative base URL (`/api`)
  and receives tokens only after a successful login response.

---

## Unresolved deployment assumptions

- **`CORS_ALLOWED_ORIGINS`** — in production the frontend is served by nginx on port 80
  and all API calls are proxied internally, so the browser never makes a cross-origin
  request.  Set `CORS_ALLOWED_ORIGINS` to the public HTTPS domain of the app
  (e.g. `https://app.example.com`) to guard against requests that bypass nginx and
  reach the backend directly.
- **nginx `real_ip` module** — the frontend nginx adds `X-Forwarded-For` when
  proxying to the backend, but the `ngx_http_realip_module` is not configured in
  `frontend/nginx.conf`.  The real client IP must be forwarded correctly by the
  **external** reverse proxy; see _Real client IP forwarding_ above.
- **`DJANGO_ALLOWED_HOSTS`** — must include the public hostname and, if the external
  proxy forwards the `Host` header, also the internal Docker service name
  (`backend` or `frontend` are not needed because gunicorn receives requests from
  the nginx container with the original `Host`).
- **Worker count** — `--workers 2` is a conservative default.  Adjust based on
  available CPU cores: the recommended formula is `2 * CPU_cores + 1`.
