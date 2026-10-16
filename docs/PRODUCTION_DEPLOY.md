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

Copy `.env.prod.example` to `.env.prod` and fill in every value before deploying:

```bash
cp .env.prod.example .env.prod
```

`.env.prod` is gitignored and must never be committed.

### Django

| Variable | Description | How to generate |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django signing key (CSRF, sessions) | `python -c "import secrets; print(secrets.token_hex(50))"` |
| `JWT_SIGNING_KEY` | Dedicated JWT signing key — **must differ from `DJANGO_SECRET_KEY`** | `python -c "import secrets; print(secrets.token_hex(50))"` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames Django will serve | `app.example.com,www.example.com` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated scheme+host CORS origins | `https://app.example.com` |
| `DJANGO_SETTINGS_MODULE` | Must be `config.settings.production` | set in `docker-compose.prod.yml` — do not override here |

### Database

| Variable | Description |
|---|---|
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password — use a strong random value |
| `POSTGRES_HOST` | Set to `db` by `docker-compose.prod.yml` — do not override here |
| `POSTGRES_PORT` | PostgreSQL port (default `5432`) |

### Nginx

| Variable | Description |
|---|---|
| `NGINX_TRUSTED_PROXY` | IP or CIDR of the trusted upstream proxy (see below). Empty = safe no-op (degraded throttling). |

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

### Real client IP forwarding (required for per-IP login throttling)

The login-rate throttle (`POST /api/auth/token/`) identifies clients by
`REMOTE_ADDR`.  **If `REMOTE_ADDR` is the same for all users, all users share
one throttle bucket** — five failed login attempts by anyone locks the endpoint
for everyone for one minute.

#### Why `REMOTE_ADDR` is the Docker bridge gateway by default

External connections enter the `frontend` container through Docker's published
port (e.g. `0.0.0.0:80->80/tcp`).  Docker's iptables MASQUERADE rule rewrites
the source address to the Docker bridge gateway before the packet reaches nginx
(confirmed: `172.21.0.1` on this machine's `campus-football_default` network —
your deployment will have a different gateway).  Every external request
therefore looks identical to nginx.

#### Fixing it: set `NGINX_TRUSTED_PROXY`

`frontend/docker-entrypoint.sh` reads the `NGINX_TRUSTED_PROXY` environment
variable at container startup and writes `/etc/nginx/realip.conf`.  When the
variable is set, the file contains `set_real_ip_from <VALUE>;`, which tells
`ngx_http_realip_module` to replace `$remote_addr` with the real client IP
from `X-Forwarded-For`.  Django's `LoginRateThrottle` then sees per-client IP
addresses as `REMOTE_ADDR`.

**Step 1 — discover the Docker bridge gateway:**

```bash
docker network inspect <compose-project>_default \
  --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
```

The compose project name defaults to the directory name (`campus-football`):

```bash
docker network inspect campus-football_default \
  --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
# → 172.21.0.1   (example; yours will differ)
```

**Step 2 — set the variable in `.env.prod`:**

```dotenv
NGINX_TRUSTED_PROXY=172.21.0.1
```

Replace `172.21.0.1` with the gateway printed by the command above.  If the
external reverse proxy runs on a **separate host** (not the same machine as
Docker), use that host's IP instead of the bridge gateway.

**Step 3 — rebuild and restart the frontend container:**

```bash
docker compose -f docker-compose.prod.yml up -d --build --no-deps frontend
```

The startup log will confirm the value was accepted:

```
nginx-entrypoint: real-IP forwarding enabled — trusting upstream: 172.21.0.1
```

#### Safety constraints enforced by docker-entrypoint.sh

| Condition | Behaviour |
|---|---|
| `NGINX_TRUSTED_PROXY` is set to a valid IP/CIDR | `set_real_ip_from <VALUE>;` written; real-IP module active |
| `NGINX_TRUSTED_PROXY` is empty or unset | Comment-only file written; module inactive (safe); **WARNING** printed to stderr |
| `NGINX_TRUSTED_PROXY=0.0.0.0/0` or `::/0` | nginx refuses to start; **ERROR** printed to stderr |

Never use `0.0.0.0/0` — it would let any client set `X-Forwarded-For` to any
IP and bypass per-IP rate limiting entirely.

#### How the two halves work together

```
Real client (203.0.113.5)
    │  X-Forwarded-For: 203.0.113.5
    ▼
External reverse proxy  (strips client-supplied headers, re-adds)
    │  X-Forwarded-For: 203.0.113.5   source IP → 172.21.0.1 (gateway after Docker NAT)
    ▼
nginx container  (ngx_http_realip_module, NGINX_TRUSTED_PROXY=172.21.0.1)
    │  replaces $remote_addr: 172.21.0.1 → 203.0.113.5
    │  sets proxy header  X-Real-IP: 203.0.113.5       ← nginx.conf line 65
    ▼
gunicorn / Django  (USE_X_REAL_IP_FOR_THROTTLE=True in production.py)
    │  WSGI environ HTTP_X_REAL_IP = 203.0.113.5
    ▼
LoginRateThrottle.get_ident()
    reads HTTP_X_REAL_IP = 203.0.113.5  ← real per-client IP ✓
```

**Trust boundary:** the backend publishes no port and is reachable only from
the nginx frontend container on the internal Docker network.  `HTTP_X_REAL_IP`
therefore always originates from nginx, never from an external client.
`USE_X_REAL_IP_FOR_THROTTLE = True` is set in `config/settings/production.py`
and must not be enabled in environments where the backend port is directly
accessible.

#### AWS ALB / Cloudflare

The real client IP is appended to `X-Forwarded-For` by the load balancer.
Set `NGINX_TRUSTED_PROXY` to the load balancer's source IP (or CIDR), and
confirm the LB strips any client-supplied `X-Forwarded-For` values before
forwarding.  `LoginRateThrottle` will then receive the correct client IP
via `HTTP_X_REAL_IP` as described above.  For cloud services that inject a
dedicated header (e.g. `CF-Connecting-IP`), implement a custom `get_ident()`
in `apps/users/throttles.py` that reads that header instead.

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
- **nginx `real_ip` module** — `ngx_http_realip_module` is configured in
  `frontend/nginx.conf` and activated at container startup when `NGINX_TRUSTED_PROXY`
  is set.  The module replaces `$remote_addr` with the real client IP resolved from
  `X-Forwarded-For`; nginx then forwards it as `X-Real-IP` to the backend.
  See _Real client IP forwarding_ above for the full setup steps.
- **`DJANGO_ALLOWED_HOSTS`** — must include the public hostname and, if the external
  proxy forwards the `Host` header, also the internal Docker service name
  (`backend` or `frontend` are not needed because gunicorn receives requests from
  the nginx container with the original `Host`).
- **Worker count** — `--workers 2` is a conservative default.  Adjust based on
  available CPU cores: the recommended formula is `2 * CPU_cores + 1`.
