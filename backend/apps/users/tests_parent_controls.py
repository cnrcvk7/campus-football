"""Tests for parent deactivate/reactivate child endpoints."""
from datetime import date

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.academies.models import Academy, AcademyStaffMembership
from apps.players.models import Player
from apps.users.models import ParentPlayerLink, User


def _create_user(email, role, password="testpass123!", **kwargs):
    return User.objects.create_user(
        email=email, password=password, role=role,
        first_name="Test", last_name="User", **kwargs,
    )


def _auth_client(user, password="testpass123!"):
    client = APIClient()
    resp = client.post(reverse("token-obtain-pair"), {"email": user.email, "password": password}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
    return client


class ParentChildDeactivateTests(TestCase):
    def setUp(self):
        self.parent = _create_user("parent@t.com", User.Role.PARENT)
        self.child_user = _create_user("child@t.com", User.Role.PLAYER)
        self.player = Player.objects.create(
            first_name="Kid", last_name="Doe",
            date_of_birth=date(2015, 6, 15), gender="M",
            user=self.child_user,
        )
        ParentPlayerLink.objects.create(parent=self.parent, player=self.player)

    def test_parent_deactivates_child(self):
        client = _auth_client(self.parent)
        resp = client.post(reverse("parent-child-deactivate", args=[self.player.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.child_user.refresh_from_db()
        self.assertFalse(self.child_user.is_active)

    def test_parent_reactivates_child(self):
        self.child_user.is_active = False
        self.child_user.save()
        client = _auth_client(self.parent)
        resp = client.post(reverse("parent-child-reactivate", args=[self.player.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.child_user.refresh_from_db()
        self.assertTrue(self.child_user.is_active)

    def test_deactivate_already_deactivated(self):
        self.child_user.is_active = False
        self.child_user.save()
        client = _auth_client(self.parent)
        resp = client.post(reverse("parent-child-deactivate", args=[self.player.id]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reactivate_already_active(self):
        client = _auth_client(self.parent)
        resp = client.post(reverse("parent-child-reactivate", args=[self.player.id]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_parent_cannot_deactivate_other_child(self):
        other_player = Player.objects.create(
            first_name="Other", last_name="Kid",
            date_of_birth=date(2015, 1, 1), gender="M",
            user=_create_user("other@t.com", User.Role.PLAYER),
        )
        client = _auth_client(self.parent)
        resp = client.post(reverse("parent-child-deactivate", args=[other_player.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_cannot_deactivate(self):
        coach = _create_user("coach@t.com", User.Role.COACH)
        client = _auth_client(coach)
        resp = client.post(reverse("parent-child-deactivate", args=[self.player.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_deactivated_user_cannot_login(self):
        self.child_user.is_active = False
        self.child_user.save()
        client = APIClient()
        resp = client.post(reverse("token-obtain-pair"), {
            "email": "child@t.com", "password": "testpass123!",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deactivated_user_cannot_refresh(self):
        # Get tokens while active
        client = APIClient()
        resp = client.post(reverse("token-obtain-pair"), {
            "email": "child@t.com", "password": "testpass123!",
        }, format="json")
        refresh_token = resp.data["refresh"]
        # Deactivate
        self.child_user.is_active = False
        self.child_user.save()
        # Try to refresh
        resp = client.post(reverse("token-refresh"), {
            "refresh": refresh_token,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_player_without_user_account(self):
        no_user_player = Player.objects.create(
            first_name="NoUser", last_name="Kid",
            date_of_birth=date(2015, 1, 1), gender="M",
        )
        ParentPlayerLink.objects.create(parent=self.parent, player=no_user_player)
        client = _auth_client(self.parent)
        resp = client.post(reverse("parent-child-deactivate", args=[no_user_player.id]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
