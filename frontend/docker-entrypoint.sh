#!/bin/sh
# Campus Football — production nginx entrypoint.
#
# This script runs inside the frontend container, before nginx starts.
# It writes /etc/nginx/realip.conf from the NGINX_TRUSTED_PROXY environment
# variable so that ngx_http_realip_module can replace $remote_addr with the
# real client IP.  nginx.conf includes this file inside the server block.
#
# Why this is necessary
# ─────────────────────
# External connections enter the container through Docker's published port.
# Docker's NAT rewrites the source address to the bridge gateway IP (e.g.
# 172.21.0.1), so every request looks identical to nginx.  Without
# set_real_ip_from, Django's LoginRateThrottle sees the gateway IP as
# REMOTE_ADDR and all users share one 5-req/min throttle bucket.
#
# What NGINX_TRUSTED_PROXY must be
# ──────────────────────────────────
# The IP or CIDR of the upstream as seen by *this* container — usually the
# Docker bridge gateway.  Discover it on a running stack with:
#
#   docker network inspect <compose-project>_default \
#     --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
#
# If the external reverse proxy runs on a separate host, use that host's IP.
# Never use 0.0.0.0/0 — that would let any client forge REMOTE_ADDR.
#
# Behaviour when the variable is unset
# ──────────────────────────────────────
# A comment-only realip.conf is written (no set_real_ip_from directive).
# The realip module is inactive.  $remote_addr stays as the gateway IP.
# LoginRateThrottle still works as a global rate cap (5 req/min across all
# users), but per-client IP limiting is not active.  A visible WARNING is
# printed to stderr so the operator can notice in container logs.
#
# See docs/PRODUCTION_DEPLOY.md § Real client IP forwarding.

set -e

REALIP_CONF=/etc/nginx/realip.conf

case "${NGINX_TRUSTED_PROXY:-}" in

    "")
        # Unset — write a comment-only no-op file (safe: module is inactive).
        cat > "$REALIP_CONF" <<'EOF'
# NGINX_TRUSTED_PROXY is not set — ngx_http_realip_module is inactive.
# $remote_addr will be the Docker bridge gateway IP, so LoginRateThrottle
# will rate-limit all users as a single bucket rather than per client IP.
# Set NGINX_TRUSTED_PROXY to the Docker bridge gateway and restart the
# frontend container to enable per-client IP rate limiting.
# See docs/PRODUCTION_DEPLOY.md § Real client IP forwarding.
EOF
        printf '\033[33mWARNING\033[0m: NGINX_TRUSTED_PROXY is not set. Per-client IP rate limiting is degraded. See docs/PRODUCTION_DEPLOY.md § Real client IP forwarding.\n' >&2
        ;;

    0.0.0.0/0|::/0|0.0.0.0)
        # Reject catch-all values that would trust every host on the internet,
        # or the unroutable 0.0.0.0 address which is never a real upstream IP.
        printf '\033[31mERROR\033[0m: NGINX_TRUSTED_PROXY must not be 0.0.0.0/0, ::/0, or 0.0.0.0 — that would allow any client to forge REMOTE_ADDR and bypass per-IP rate limiting. Provide the specific IP of the Docker bridge gateway (e.g. 172.21.0.1).\n' >&2
        exit 1
        ;;

    *)
        # Valid value — write the directive and log it.
        printf 'set_real_ip_from %s;\n' "$NGINX_TRUSTED_PROXY" > "$REALIP_CONF"
        printf 'nginx-entrypoint: real-IP forwarding enabled — trusting upstream: %s\n' "$NGINX_TRUSTED_PROXY" >&2
        ;;

esac

exec nginx -g 'daemon off;'
