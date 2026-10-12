from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    Rate-limits POST /api/auth/token/ (login attempts).

    Limits to 5 attempts per minute per client IP address.
    Uses REMOTE_ADDR only — never trusts client-supplied X-Forwarded-For
    headers, which are trivially spoofable and would bypass per-IP limiting.

    Deployment note: when the application runs behind a reverse proxy
    (e.g. Nginx or a cloud load balancer), ensure the proxy is configured
    to set REMOTE_ADDR to the real client IP.  With Nginx this means using
    proxy_pass with $remote_addr rather than relying on pass-through.
    """

    scope = "login"

    def get_ident(self, request):
        """Return the client IP from REMOTE_ADDR, ignoring forwarded headers."""
        return request.META.get("REMOTE_ADDR", "")

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
