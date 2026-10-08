from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.players.models import Player
from apps.users.models import User
from .models import Academy, PlayerAcademyMembership


def make_auth_user(email="academy_test@example.com") -> User:
    return User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="Test",
        last_name="User",
        role=User.Role.COACH,
    )

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

VALID_ACADEMY_DATA = {
    "name": "Manchester United Academy",
    "city": "Manchester",
    "country": "England",
}

VALID_PLAYER_DATA = {
    "first_name": "Marcus",
    "last_name": "Rashford",
    "date_of_birth": "2000-10-31",
    "gender": "M",
}


def make_academy(**overrides) -> Academy:
    return Academy.objects.create(**{**VALID_ACADEMY_DATA, **overrides})


def make_player(**overrides) -> Player:
    return Player.objects.create(**{**VALID_PLAYER_DATA, **overrides})


# ---------------------------------------------------------------------------
# Academy API tests
# ---------------------------------------------------------------------------

class AcademyAPITests(APITestCase):

    def setUp(self):
        self.user = make_auth_user()
        self.client.force_authenticate(user=self.user)
        self.academy = make_academy()
        self.list_url = reverse("academy-list")
        self.detail_url = reverse("academy-detail", kwargs={"pk": self.academy.pk})

    def test_academy_creation(self):
        """POST /api/academies/ creates an academy and returns 201."""
        payload = {"name": "Liverpool Academy", "city": "Liverpool", "country": "England"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Liverpool Academy")
        self.assertIn("id", response.data)

    def test_academy_list(self):
        """GET /api/academies/ returns at least one academy."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertGreaterEqual(len(results), 1)

    def test_academy_retrieve(self):
        """GET /api/academies/{id}/ returns the correct academy."""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], self.academy.name)
        self.assertEqual(str(response.data["id"]), str(self.academy.pk))

    def test_academy_update(self):
        """PATCH /api/academies/{id}/ updates supplied fields only."""
        response = self.client.patch(
            self.detail_url, {"description": "Top youth academy"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["description"], "Top youth academy")
        self.assertEqual(response.data["name"], self.academy.name)

    def test_academy_delete_not_allowed(self):
        """DELETE must return 405."""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_academy_name_required(self):
        """Creating an academy without a name must fail."""
        response = self.client.post(self.list_url, {"city": "London"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)


# ---------------------------------------------------------------------------
# PlayerAcademyMembership model tests
# ---------------------------------------------------------------------------

class PlayerAcademyMembershipTests(TestCase):

    def setUp(self):
        self.player = make_player()
        self.academy = make_academy()

    def test_player_can_join_academy(self):
        """A PlayerAcademyMembership record can be created."""
        membership = PlayerAcademyMembership.objects.create(
            player=self.player,
            academy=self.academy,
            joined_at="2024-01-15",
        )
        self.assertIsNotNone(membership.pk)
        self.assertEqual(membership.status, PlayerAcademyMembership.Status.ACTIVE)
        self.assertIsNone(membership.left_at)

    def test_academy_history_is_preserved(self):
        """Closing a membership and opening a new one preserves both records."""
        membership_a = PlayerAcademyMembership.objects.create(
            player=self.player,
            academy=self.academy,
            joined_at="2023-09-01",
            left_at="2024-06-30",
            status=PlayerAcademyMembership.Status.LEFT,
        )
        academy_b = make_academy(name="Arsenal Academy", city="London")
        membership_b = PlayerAcademyMembership.objects.create(
            player=self.player,
            academy=academy_b,
            joined_at="2024-07-01",
        )
        all_memberships = PlayerAcademyMembership.objects.filter(player=self.player)
        self.assertEqual(all_memberships.count(), 2)
        self.assertIn(membership_a, all_memberships)
        self.assertIn(membership_b, all_memberships)

    def test_joined_at_cannot_be_after_left_at(self):
        """Serializer must reject left_at < joined_at."""
        from .serializers import PlayerAcademyMembershipSerializer
        data = {
            "player": self.player.pk,
            "academy": self.academy.pk,
            "joined_at": "2024-06-01",
            "left_at": "2024-01-01",  # before joined_at
            "status": "left",
        }
        serializer = PlayerAcademyMembershipSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("left_at", serializer.errors)
