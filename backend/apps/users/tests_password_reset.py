"""Tests for password reset endpoints."""
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient

from .models import User


def _create_user(email, role="COACH", password="testpass123!"):
    return User.objects.create_user(
        email=email, password=password, role=role,
        first_name="Test", last_name="User",
    )


class PasswordResetRequestTests(TestCase):
    def setUp(self):
        self.url = reverse("password-reset-request")
        self.user = _create_user("reset@example.com")

    def test_always_returns_200_for_existing_email(self):
        client = APIClient()
        resp = client.post(self.url, {"email": "reset@example.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_always_returns_200_for_nonexistent_email(self):
        """No account enumeration."""
        client = APIClient()
        resp = client.post(self.url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_same_response_for_existing_and_nonexistent(self):
        client = APIClient()
        r1 = client.post(self.url, {"email": "reset@example.com"}, format="json")
        r2 = client.post(self.url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(r1.data, r2.data)


class PasswordResetConfirmTests(TestCase):
    def setUp(self):
        self.url = reverse("password-reset-confirm")
        self.user = _create_user("reset@example.com", password="oldpass123!")

    def _make_uid_token(self, user=None):
        user = user or self.user
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        return uid, token

    def test_valid_reset(self):
        uid, token = self._make_uid_token()
        client = APIClient()
        resp = client.post(self.url, {
            "uid": uid, "token": token, "password": "NewSecureP@ss456!",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecureP@ss456!"))

    def test_token_cannot_be_reused(self):
        uid, token = self._make_uid_token()
        client = APIClient()
        client.post(self.url, {
            "uid": uid, "token": token, "password": "NewSecureP@ss456!",
        }, format="json")
        # Second attempt should fail (token invalidated by password change)
        resp = client.post(self.url, {
            "uid": uid, "token": token, "password": "AnotherP@ss789!",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_uid(self):
        client = APIClient()
        resp = client.post(self.url, {
            "uid": "invalid", "token": "invalid", "password": "NewSecureP@ss456!",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        client = APIClient()
        resp = client.post(self.url, {
            "uid": uid, "token": "bad-token", "password": "NewSecureP@ss456!",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_password_rejected(self):
        uid, token = self._make_uid_token()
        client = APIClient()
        resp = client.post(self.url, {
            "uid": uid, "token": token, "password": "123",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class PasswordResetThrottleTests(TestCase):
    def test_request_throttled_after_limit(self):
        url = reverse("password-reset-request")
        client = APIClient()
        for _ in range(4):
            resp = client.post(url, {"email": "a@b.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
