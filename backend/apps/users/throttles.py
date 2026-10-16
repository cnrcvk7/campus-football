from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    Rate-limits POST /api/auth/token/ (login attempts).

    Limits to 5 attempts per minute per client IP address.

    IP source selection
    ───────────────────
    When ``USE_X_REAL_IP_FOR_THROTTLE = True`` (set in production.py), the
    client IP is taken from ``HTTP_X_REAL_IP``.  The nginx frontend proxy
    populates this header via ``proxy_set_header X-Real-IP $remote_addr;``
    *after* ``ngx_http_realip_module`` has resolved ``$remote_addr`` to the
    real client IP from ``X-Forwarded-For``.  In production the backend
    publishes no port and is reachable only through that proxy, so
    ``HTTP_X_REAL_IP`` is always proxy-sourced and not forgeable by an
    external client.

    When ``USE_X_REAL_IP_FOR_THROTTLE`` is ``False`` (the default) or
    ``HTTP_X_REAL_IP`` is absent, the fallback is ``REMOTE_ADDR`` — the TCP
    socket peer address.  This path is used in development and tests where
    there is no nginx in the request chain.

    ``X-Forwarded-For`` is intentionally never read here: it can contain
    multiple, client-appended values and is trivially spoofable when the
    backend is directly accessible (e.g. during development).
    """

    scope = "login"

    def get_ident(self, request):
        """Return the client IP used for throttle bucket identification."""
        if getattr(settings, "USE_X_REAL_IP_FOR_THROTTLE", False):
            x_real_ip = request.META.get("HTTP_X_REAL_IP", "").strip()
            if x_real_ip:
                return x_real_ip
        return request.META.get("REMOTE_ADDR", "")

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
