from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class _IPRateThrottle(SimpleRateThrottle):
    """Base class for IP-based throttles sharing the same IP detection logic."""

    def get_ident(self, request):
        if getattr(settings, "USE_X_REAL_IP_FOR_THROTTLE", False):
            x_real_ip = request.META.get("HTTP_X_REAL_IP", "").strip()
            if x_real_ip:
                return x_real_ip
        return request.META.get("REMOTE_ADDR", "")

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class InvitationPreviewThrottle(_IPRateThrottle):
    scope = "invitation_preview"


class InvitationRedeemThrottle(_IPRateThrottle):
    scope = "invitation_redeem"


class PasswordResetThrottle(_IPRateThrottle):
    scope = "password_reset"
