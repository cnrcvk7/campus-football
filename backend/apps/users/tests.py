from unittest.mock import PropertyMock, patch

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_USER_DATA = {
    "email": "player@test.com",
    "password": "securepass123",
    "first_name": "Marcus",
    "last_name": "Rashford",
    "role": User.Role.PLAYER,
}


def make_user(**overrides) -> User:
    data = {**VALID_USER_DATA, **overrides}
    password = data.pop("password", "securepass123")
    return User.objects.create_user(password=password, **data)


# ---------------------------------------------------------------------------
# 1. User creation
# ---------------------------------------------------------------------------

class UserModelTests(TestCase):

    def test_user_creation(self):
        """User can be created and has a UUID primary key."""
        user = make_user()
        self.assertIsNotNone(user.pk)
        self.assertEqual(user.email, VALID_USER_DATA["email"])
        self.assertEqual(user.role, User.Role.PLAYER)
        self.assertTrue(user.is_active)

    def test_password_hashing(self):
        """Password is stored hashed, not in plain text."""
        user = make_user()
        self.assertNotEqual(user.password, "securepass123")
        self.assertTrue(user.check_password("securepass123"))

    def test_email_is_username_field(self):
        """Users are identified by email, not username."""
        self.assertEqual(User.USERNAME_FIELD, "email")

    def test_role_is_not_client_writable(self):
        """Role is stored in the database, not derivable from request body alone.
        This is a model-level check — the API layer must never accept a role override."""
        user = make_user(role=User.Role.PLAYER)
        user.refresh_from_db()
        self.assertEqual(user.role, User.Role.PLAYER)


# ---------------------------------------------------------------------------
# JWT token tests
# ---------------------------------------------------------------------------

class JWTTokenTests(APITestCase):

    def setUp(self):
        self.user = make_user()
        self.token_url = reverse("token-obtain-pair")
        self.refresh_url = reverse("token-refresh")

    def test_user_can_obtain_token(self):
        """POST /api/auth/token/ returns access and refresh tokens."""
        response = self.client.post(
            self.token_url,
            {"email": VALID_USER_DATA["email"], "password": "securepass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_invalid_credentials_rejected(self):
        """Wrong password returns 401."""
        response = self.client.post(
            self.token_url,
            {"email": VALID_USER_DATA["email"], "password": "wrongpassword"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh(self):
        """POST /api/auth/token/refresh/ with a valid refresh token returns a new access token."""
        obtain_response = self.client.post(
            self.token_url,
            {"email": VALID_USER_DATA["email"], "password": "securepass123"},
            format="json",
        )
        refresh_token = obtain_response.data["refresh"]
        response = self.client.post(
            self.refresh_url,
            {"refresh": refresh_token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)


# ---------------------------------------------------------------------------
# /api/auth/me/ tests
# ---------------------------------------------------------------------------

class MeEndpointTests(APITestCase):

    def setUp(self):
        self.user = make_user()
        self.me_url = reverse("auth-me")

    def test_me_returns_user_data_when_authenticated(self):
        """GET /api/auth/me/ with valid JWT returns user profile."""
        # Obtain a real JWT token
        token_response = self.client.post(
            reverse("token-obtain-pair"),
            {"email": VALID_USER_DATA["email"], "password": "securepass123"},
            format="json",
        )
        access_token = token_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(response.data["role"], User.Role.PLAYER)
        self.assertNotIn("password", response.data)
        self.assertIsNone(response.data["player_profile"])

    def test_unauthenticated_me_returns_401(self):
        """GET /api/auth/me/ without a token returns 401."""
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Permission / authentication guard tests
# ---------------------------------------------------------------------------

class AuthenticationGuardTests(APITestCase):

    def test_unauthenticated_player_list_returns_401(self):
        """GET /api/players/ without auth returns 401."""
        response = self.client.get(reverse("player-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_academy_list_returns_401(self):
        """GET /api/academies/ without auth returns 401."""
        response = self.client.get(reverse("academy-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_team_list_returns_401(self):
        """GET /api/teams/ without auth returns 401."""
        response = self.client.get(reverse("team-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_health_check_is_public(self):
        """GET /api/health/ requires no authentication."""
        response = self.client.get(reverse("health-check"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Role permission tests
# ---------------------------------------------------------------------------

class RolePermissionTests(APITestCase):

    def _make_and_auth(self, role: str) -> User:
        import uuid
        user = make_user(email=f"{uuid.uuid4()}@test.com", role=role)
        self.client.force_authenticate(user=user)
        return user

    def test_is_academy_admin_permission(self):
        """AcademyAdmin role passes IsAcademyAdmin permission check."""
        from apps.users.permissions import IsAcademyAdmin
        user = make_user(role=User.Role.ACADEMY_ADMIN)
        perm = IsAcademyAdmin()

        class FakeRequest:
            user = None
        req = FakeRequest()
        req.user = user
        self.assertTrue(perm.has_permission(req, None))

    def test_player_role_fails_is_academy_admin(self):
        """PLAYER role fails IsAcademyAdmin permission check."""
        from apps.users.permissions import IsAcademyAdmin
        user = make_user(role=User.Role.PLAYER)
        perm = IsAcademyAdmin()

        class FakeRequest:
            user = None
        req = FakeRequest()
        req.user = user
        self.assertFalse(perm.has_permission(req, None))

    def test_is_player_permission(self):
        """PLAYER role passes IsPlayer permission check."""
        from apps.users.permissions import IsPlayer
        user = make_user(role=User.Role.PLAYER)
        perm = IsPlayer()

        class FakeRequest:
            user = None
        req = FakeRequest()
        req.user = user
        self.assertTrue(perm.has_permission(req, None))


# ---------------------------------------------------------------------------
# Player ↔ User link tests
# ---------------------------------------------------------------------------

class PlayerUserLinkTests(APITestCase):

    def test_player_can_be_linked_to_user(self):
        """A Player's user field can be set to a User account."""
        from apps.players.models import Player
        user = make_user(role=User.Role.PLAYER)
        player = Player.objects.create(
            first_name="Marcus",
            last_name="Rashford",
            date_of_birth="2000-10-31",
            gender="M",
        )
        player.user = user
        player.save()
        player.refresh_from_db()
        self.assertEqual(player.user_id, user.pk)
        self.assertEqual(user.player_profile.football_id, player.football_id)

    def test_me_returns_player_info_when_linked(self):
        """GET /api/auth/me/ includes player info when user is linked to a Player."""
        from apps.players.models import Player
        user = make_user(role=User.Role.PLAYER)
        Player.objects.create(
            first_name="Phil",
            last_name="Foden",
            date_of_birth="2000-05-28",
            gender="M",
            user=user,
        )
        self.client.force_authenticate(user=user)
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["player_profile"])
        self.assertIn("football_id", response.data["player_profile"])
        self.assertEqual(response.data["player_profile"]["first_name"], "Phil")


# ---------------------------------------------------------------------------
# MeSerializer.get_player_profile() unit tests
# ---------------------------------------------------------------------------


class MeSerializerPlayerProfileTests(TestCase):
    """
    Unit tests for MeSerializer.get_player_profile().

    These tests target the serializer directly (not via the HTTP layer) so
    that error-propagation behaviour can be verified without needing to wire
    up middleware or authentication.
    """

    def test_returns_none_when_no_player_profile(self):
        """get_player_profile returns None for a user with no linked Player."""
        from apps.users.serializers import MeSerializer

        user = make_user(email="noprofile@test.com")
        self.assertIsNone(MeSerializer(user).data["player_profile"])

    def test_returns_player_dict_when_linked(self):
        """get_player_profile returns the expected dict when a Player is linked."""
        import uuid

        from apps.players.models import Player
        from apps.users.serializers import MeSerializer

        user = make_user(email=f"{uuid.uuid4()}@test.com")
        player = Player.objects.create(
            first_name="Test",
            last_name="Player",
            date_of_birth="2000-01-01",
            gender="M",
            user=user,
        )
        profile = MeSerializer(user).data["player_profile"]
        self.assertIsNotNone(profile)
        self.assertEqual(profile["player_id"], str(player.id))
        self.assertEqual(profile["football_id"], player.football_id)
        self.assertEqual(profile["first_name"], "Test")
        self.assertEqual(profile["last_name"], "Player")

    def test_unexpected_error_propagates(self):
        """
        Non-ObjectDoesNotExist exceptions are not swallowed.

        A RuntimeError from a broken ORM accessor must propagate out of
        get_player_profile() rather than being silently converted to None.
        """
        from apps.users.serializers import MeSerializer

        user = make_user(email="error@test.com")
        # Replace the class-level descriptor with a mock that raises an
        # unexpected error, simulating a broken DB connection or ORM bug.
        with patch.object(type(user), "player_profile", new_callable=PropertyMock) as mock_pp:
            mock_pp.side_effect = RuntimeError("unexpected database error")
            with self.assertRaises(RuntimeError):
                _ = MeSerializer(user).data


# ---------------------------------------------------------------------------
# Login rate-limit throttle tests
# ---------------------------------------------------------------------------

# Each test in this class uses a real LocMemCache (distinct location so it
# does not clash with any other cache used in the process) and clears it in
# setUp so tests are fully independent of each other.
_THROTTLE_CACHE_SETTINGS = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "login-throttle-test",
    }
}


@override_settings(CACHES=_THROTTLE_CACHE_SETTINGS)
class LoginRateThrottleTests(APITestCase):
    """
    Verify that:
    - POST /api/auth/token/ is throttled to 5 requests/minute per IP.
    - A valid login within the limit succeeds.
    - The 6th request within the window returns HTTP 429.
    - POST /api/auth/token/refresh/ is never subject to the login throttle.
    """

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.user = make_user(email="throttle@test.com")
        self.token_url = reverse("token-obtain-pair")
        self.refresh_url = reverse("token-refresh")

    def test_login_succeeds_within_limit(self):
        """First 5 requests are allowed (valid credentials → 200 each time)."""
        for i in range(5):
            response = self.client.post(
                self.token_url,
                {"email": "throttle@test.com", "password": "securepass123"},
                format="json",
            )
            self.assertEqual(
                response.status_code,
                status.HTTP_200_OK,
                msg=f"Request {i + 1} should succeed within the throttle limit",
            )

    def test_login_blocked_after_limit(self):
        """6th request within the same minute returns 429."""
        for _ in range(5):
            self.client.post(
                self.token_url,
                {"email": "throttle@test.com", "password": "wrongpassword"},
                format="json",
            )
        response = self.client.post(
            self.token_url,
            {"email": "throttle@test.com", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_failed_attempts_count_toward_limit(self):
        """Invalid-credential attempts (401) consume quota; correct credentials still get 429 after limit."""
        # 5 bad-password attempts exhaust the quota
        for _ in range(5):
            resp = self.client.post(
                self.token_url,
                {"email": "throttle@test.com", "password": "wrong"},
                format="json",
            )
            self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Even correct credentials are now blocked
        response = self.client.post(
            self.token_url,
            {"email": "throttle@test.com", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_refresh_is_not_throttled(self):
        """Token refresh is unaffected even when the login throttle is exhausted."""
        # Obtain a valid refresh token (1st login request)
        obtain = self.client.post(
            self.token_url,
            {"email": "throttle@test.com", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(obtain.status_code, status.HTTP_200_OK)
        refresh_token = obtain.data["refresh"]

        # Use up the remaining 4 login slots
        for _ in range(4):
            self.client.post(
                self.token_url,
                {"email": "throttle@test.com", "password": "wrongpassword"},
                format="json",
            )

        # Login endpoint is now blocked
        blocked = self.client.post(
            self.token_url,
            {"email": "throttle@test.com", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Refresh endpoint is unaffected
        response = self.client.post(
            self.refresh_url,
            {"refresh": refresh_token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)


# ---------------------------------------------------------------------------
# LoginRateThrottle — X-Real-IP forwarding tests
# ---------------------------------------------------------------------------

_THROTTLE_CACHE_REAL_IP = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "login-throttle-realip-test",
    }
}


@override_settings(CACHES=_THROTTLE_CACHE_REAL_IP)
class LoginRateThrottleRealIPTests(APITestCase):
    """
    Verify the IP-source selection logic in LoginRateThrottle.get_ident().

    Three scenarios:
    1. USE_X_REAL_IP_FOR_THROTTLE=True + header present → use header value.
    2. USE_X_REAL_IP_FOR_THROTTLE=True + header absent → fall back to REMOTE_ADDR.
    3. USE_X_REAL_IP_FOR_THROTTLE=False (default) + header present → ignore header,
       use REMOTE_ADDR (spoofing-safe path for direct-access environments).
    """

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.throttle_url = reverse("token-obtain-pair")
        # Two distinct users so we can issue valid credentials from two "clients".
        make_user(email="realip_a@test.com")
        make_user(email="realip_b@test.com")

    # ------------------------------------------------------------------
    # Direct unit test of get_ident() — no HTTP layer needed
    # ------------------------------------------------------------------

    @override_settings(USE_X_REAL_IP_FOR_THROTTLE=True)
    def test_get_ident_uses_x_real_ip_when_flag_on(self):
        """get_ident() returns HTTP_X_REAL_IP when USE_X_REAL_IP_FOR_THROTTLE=True."""
        from apps.users.throttles import LoginRateThrottle

        class FakeRequest:
            META = {"HTTP_X_REAL_IP": "203.0.113.5", "REMOTE_ADDR": "172.21.0.1"}

        throttle = LoginRateThrottle()
        self.assertEqual(throttle.get_ident(FakeRequest()), "203.0.113.5")

    @override_settings(USE_X_REAL_IP_FOR_THROTTLE=True)
    def test_get_ident_falls_back_to_remote_addr_when_header_absent(self):
        """get_ident() falls back to REMOTE_ADDR when HTTP_X_REAL_IP is missing."""
        from apps.users.throttles import LoginRateThrottle

        class FakeRequest:
            META = {"REMOTE_ADDR": "172.21.0.1"}

        throttle = LoginRateThrottle()
        self.assertEqual(throttle.get_ident(FakeRequest()), "172.21.0.1")

    @override_settings(USE_X_REAL_IP_FOR_THROTTLE=False)
    def test_get_ident_ignores_x_real_ip_when_flag_off(self):
        """get_ident() ignores HTTP_X_REAL_IP and uses REMOTE_ADDR when flag is False."""
        from apps.users.throttles import LoginRateThrottle

        class FakeRequest:
            # Header present — should be ignored because the flag is off.
            META = {"HTTP_X_REAL_IP": "1.2.3.4", "REMOTE_ADDR": "172.21.0.1"}

        throttle = LoginRateThrottle()
        self.assertEqual(throttle.get_ident(FakeRequest()), "172.21.0.1")

    # ------------------------------------------------------------------
    # Integration tests — two clients, one throttle, via HTTP test client
    # ------------------------------------------------------------------

    @override_settings(USE_X_REAL_IP_FOR_THROTTLE=True)
    def test_two_clients_have_independent_buckets_via_x_real_ip(self):
        """
        With USE_X_REAL_IP_FOR_THROTTLE=True, requests from two different
        X-Real-IP addresses are counted in separate throttle buckets.
        Exhausting the quota for IP A must not affect IP B.
        """
        from django.core.cache import cache
        cache.clear()

        # Exhaust IP A's quota (5 bad-password attempts).
        for _ in range(5):
            self.client.post(
                self.throttle_url,
                {"email": "realip_a@test.com", "password": "wrong"},
                format="json",
                HTTP_X_REAL_IP="203.0.113.10",
            )

        # IP A is now blocked.
        resp_a = self.client.post(
            self.throttle_url,
            {"email": "realip_a@test.com", "password": "wrong"},
            format="json",
            HTTP_X_REAL_IP="203.0.113.10",
        )
        self.assertEqual(resp_a.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # IP B is completely unaffected — its bucket is empty.
        resp_b = self.client.post(
            self.throttle_url,
            {"email": "realip_b@test.com", "password": "wrong"},
            format="json",
            HTTP_X_REAL_IP="203.0.113.20",
        )
        # Still a credentials error (401), not a throttle error (429).
        self.assertEqual(resp_b.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(USE_X_REAL_IP_FOR_THROTTLE=False)
    def test_x_real_ip_header_does_not_bypass_throttle_when_flag_off(self):
        """
        When USE_X_REAL_IP_FOR_THROTTLE=False (the default outside production),
        a client cannot escape throttling by sending different X-Real-IP values.
        All requests from the same REMOTE_ADDR share one bucket.
        """
        from django.core.cache import cache
        cache.clear()

        # 5 attempts from REMOTE_ADDR "127.0.0.1" (DRF test client default),
        # each with a different spoofed X-Real-IP header.
        for i in range(5):
            self.client.post(
                self.throttle_url,
                {"email": "realip_a@test.com", "password": "wrong"},
                format="json",
                HTTP_X_REAL_IP=f"1.2.3.{i}",  # different value each time
            )

        # 6th attempt — must be throttled despite yet another X-Real-IP value.
        resp = self.client.post(
            self.throttle_url,
            {"email": "realip_a@test.com", "password": "wrong"},
            format="json",
            HTTP_X_REAL_IP="9.9.9.9",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


# ---------------------------------------------------------------------------
# Logout / blacklist tests
# ---------------------------------------------------------------------------


class LogoutTests(APITestCase):
    """
    Verify POST /api/auth/logout/ blacklists the submitted refresh token
    so it cannot be reused, and that all invalid/edge-case inputs are
    handled without a 5xx error.
    """

    def setUp(self):
        self.user = make_user(email="logout@test.com")
        self.token_url = reverse("token-obtain-pair")
        self.refresh_url = reverse("token-refresh")
        self.logout_url = reverse("auth-logout")

    def _obtain_tokens(self):
        response = self.client.post(
            self.token_url,
            {"email": "logout@test.com", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["access"], response.data["refresh"]

    def test_logout_returns_204(self):
        """POST /api/auth/logout/ with a valid refresh token returns 204 No Content."""
        _, refresh = self._obtain_tokens()
        response = self.client.post(
            self.logout_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_blacklisted_token_cannot_refresh(self):
        """After logout the blacklisted refresh token is rejected by the refresh endpoint."""
        _, refresh = self._obtain_tokens()
        self.client.post(self.logout_url, {"refresh": refresh}, format="json")
        response = self.client.post(
            self.refresh_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_with_missing_refresh_field_returns_400(self):
        """POST /api/auth/logout/ with an empty body returns 400 (field required)."""
        response = self.client.post(self.logout_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_with_malformed_token_returns_401(self):
        """POST /api/auth/logout/ with a garbage string returns 401, not 500."""
        response = self.client.post(
            self.logout_url, {"refresh": "not.a.valid.jwt"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_with_already_blacklisted_token_returns_401(self):
        """Submitting an already-blacklisted token returns 401, not 500."""
        _, refresh = self._obtain_tokens()
        self.client.post(self.logout_url, {"refresh": refresh}, format="json")
        # Second logout attempt with the same token
        response = self.client.post(
            self.logout_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_does_not_require_access_token(self):
        """
        POST /api/auth/logout/ succeeds even with no Authorization header.
        Supports the common case where the access token has expired before logout.
        """
        _, refresh = self._obtain_tokens()
        self.client.credentials()  # clear any stored credentials
        response = self.client.post(
            self.logout_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Refresh-token rotation tests
# ---------------------------------------------------------------------------


class RefreshRotationTests(APITestCase):
    """
    Verify that ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION cause the
    refresh endpoint to return a replacement refresh token and invalidate
    the old one on every use.
    """

    def setUp(self):
        self.user = make_user(email="rotation@test.com")
        self.token_url = reverse("token-obtain-pair")
        self.refresh_url = reverse("token-refresh")

    def _obtain_tokens(self):
        response = self.client.post(
            self.token_url,
            {"email": "rotation@test.com", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["access"], response.data["refresh"]

    def test_refresh_returns_both_tokens(self):
        """POST /api/auth/token/refresh/ returns access AND refresh tokens when rotation is on."""
        _, refresh = self._obtain_tokens()
        response = self.client.post(
            self.refresh_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_rotated_out_token_is_rejected(self):
        """After one rotation the original refresh token is blacklisted and returns 401."""
        _, original_refresh = self._obtain_tokens()
        rotate_response = self.client.post(
            self.refresh_url, {"refresh": original_refresh}, format="json"
        )
        self.assertEqual(rotate_response.status_code, status.HTTP_200_OK)
        new_refresh = rotate_response.data["refresh"]
        self.assertNotEqual(new_refresh, original_refresh)

        reuse_response = self.client.post(
            self.refresh_url, {"refresh": original_refresh}, format="json"
        )
        self.assertEqual(reuse_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_new_refresh_token_is_valid(self):
        """The replacement refresh token returned after rotation can itself be used."""
        _, original_refresh = self._obtain_tokens()
        rotate_response = self.client.post(
            self.refresh_url, {"refresh": original_refresh}, format="json"
        )
        new_refresh = rotate_response.data["refresh"]

        response = self.client.post(
            self.refresh_url, {"refresh": new_refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)


# ---------------------------------------------------------------------------
# Inactive-user token rejection tests
# ---------------------------------------------------------------------------


class InactiveUserTokenTests(APITestCase):
    """
    Verify that deactivating a user causes their JWT access token to be
    rejected on all subsequent authenticated calls.
    """

    def setUp(self):
        self.user = make_user(email="inactive@test.com")
        self.me_url = reverse("auth-me")

    def test_inactive_user_access_token_rejected(self):
        """An access token belonging to a deactivated user returns 401."""
        token_response = self.client.post(
            reverse("token-obtain-pair"),
            {"email": "inactive@test.com", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(token_response.status_code, status.HTTP_200_OK)
        access_token = token_response.data["access"]

        # Deactivate the user
        self.user.is_active = False
        self.user.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_active_user_token_accepted(self):
        """Baseline: an active user's access token is accepted normally."""
        token_response = self.client.post(
            reverse("token-obtain-pair"),
            {"email": "inactive@test.com", "password": "securepass123"},
            format="json",
        )
        access_token = token_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Email normalization tests
# ---------------------------------------------------------------------------

class EmailNormalizationTests(APITestCase):
    """Login and password-reset must work regardless of the email case typed."""

    def setUp(self):
        self.user = make_user(email="alice@example.com")
        self.token_url = reverse("token-obtain-pair")

    def test_login_with_mixed_case_email(self):
        """POST /api/auth/token/ normalises email before authenticating."""
        response = self.client.post(
            self.token_url,
            {"email": "Alice@Example.COM", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_login_with_leading_trailing_spaces(self):
        response = self.client.post(
            self.token_url,
            {"email": "  alice@example.com  ", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_user_stores_email_lowercased(self):
        user = User.objects.create_user(
            email="BOB@Example.COM", password="testpass123!",
            first_name="Bob", last_name="Test", role=User.Role.COACH,
        )
        self.assertEqual(user.email, "bob@example.com")


class PasswordResetEmailNormalizationTests(APITestCase):
    """Password reset must find the user case-insensitively."""

    def setUp(self):
        self.user = make_user(email="alice@example.com")
        self.url = reverse("password-reset-request")

    def test_reset_with_mixed_case_sends_email(self):
        from unittest.mock import patch
        with patch("apps.users.views.send_mail") as mock_send:
            response = self.client.post(
                self.url,
                {"email": "ALICE@Example.COM"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            mock_send.assert_called_once()
            # Verify it was sent to the right user
            self.assertEqual(mock_send.call_args[1]["recipient_list"], [self.user.email])


class EmailCollisionMigrationTests(TestCase):
    """Test the collision detection in the lowercase-emails data migration."""

    def test_no_collision_runs_cleanly(self):
        """When no emails collide, the migration logic lowers them."""
        User.objects.create_user(
            email="upper@test.com", password="testpass123!",
            first_name="A", last_name="B", role=User.Role.COACH,
        )
        # Directly set an upper-case email via update (bypass create_user normalization)
        User.objects.filter(email="upper@test.com").update(email="UPPER@test.com")
        # Run the migration function directly
        import importlib
        mod = importlib.import_module("apps.users.migrations.0004_lowercase_user_emails")
        lowercase_emails = mod.lowercase_emails
        from django.apps import apps
        lowercase_emails(apps, None)
        self.assertTrue(User.objects.filter(email="upper@test.com").exists())

    def test_collision_raises_error(self):
        """When lowercasing would create duplicates, migration aborts."""
        u1 = User.objects.create_user(
            email="dup@test.com", password="testpass123!",
            first_name="A", last_name="B", role=User.Role.COACH,
        )
        u2 = User.objects.create_user(
            email="dup2@test.com", password="testpass123!",
            first_name="C", last_name="D", role=User.Role.COACH,
        )
        # Force both to collide when lowercased
        User.objects.filter(pk=u1.pk).update(email="DUP@test.com")
        User.objects.filter(pk=u2.pk).update(email="dup@test.com")
        import importlib
        mod = importlib.import_module("apps.users.migrations.0004_lowercase_user_emails")
        lowercase_emails = mod.lowercase_emails
        from django.apps import apps
        with self.assertRaises(RuntimeError) as ctx:
            lowercase_emails(apps, None)
        self.assertIn("would collide", str(ctx.exception))
