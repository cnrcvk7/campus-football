# Production Deployment Guide

## Required environment variables

All variables below must be present in `.env.prod` (or injected by your secret manager) before starting the production stack.

### Django

| Variable | Description | How to generate |
|---|---|---|
| `DJANGO_SECRET_KEY` | Cryptographic signing key | `python -c "import secrets; print(secrets.token_hex(50))"` |
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

## Generating a secret key safely

```bash
python -c "import secrets; print(secrets.token_hex(50))"
```

Store the output directly in your secret manager or `.env.prod`. **Never log it, commit it, or print it in CI output.**

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
