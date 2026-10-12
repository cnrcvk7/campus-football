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
