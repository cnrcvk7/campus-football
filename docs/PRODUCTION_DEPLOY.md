# Production Deployment Guide

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

# 3. Verify
docker compose -f docker-compose.prod.yml logs backend
```

The `command` in `docker-compose.prod.yml` runs `migrate`, `collectstatic`, then Gunicorn automatically on every start.

---

## Updating the application

```bash
# Pull new code, rebuild the image, restart without data loss
docker compose -f docker-compose.prod.yml up -d --build --no-deps backend
```

---

## Reverse proxy requirement

`production.py` sets `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` and `SECURE_SSL_REDIRECT = True`.

**Your reverse proxy (nginx, Caddy, AWS ALB, etc.) must:**

1. Terminate TLS.
2. Set `X-Forwarded-Proto: https` on every forwarded request.
3. **Strip any client-supplied `X-Forwarded-Proto` header** before forwarding — otherwise a client can bypass the HTTPS check.

If your proxy does not set `X-Forwarded-Proto`, set `SECURE_PROXY_SSL_HEADER` to `None` and handle redirects at the proxy layer instead.

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
| Server | `runserver` | Gunicorn |
| DB port exposed | Yes (host port 5433) | No |
| Source bind mount | Yes (hot reload) | No (immutable image) |

---

## Docker security notes

- The backend container runs as non-root user `appuser` (UID 1000).
- The database is not exposed to the host network in `docker-compose.prod.yml`.
- `.dockerignore` prevents `.env` files, `.git`, and Python caches from being baked into the image.
- Secrets are injected at runtime via `env_file: .env.prod`, never at build time.
