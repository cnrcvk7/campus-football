import uuid

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APITestCase

from apps.players.models import Player
from apps.users.models import User
from .models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from .permissions import (
    get_user_academy_ids,
    require_academy_admin_of_academy,
    require_staff_of_academy,
)


def make_auth_user(email="academy_test@example.com", role=User.Role.ACADEMY_ADMIN) -> User:
    return User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="Test",
        last_name="User",
        role=role,
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


# ---------------------------------------------------------------------------
# Academy write-authorization tests
# ---------------------------------------------------------------------------

class AcademyWriteAuthorizationTests(APITestCase):
    """
    Verify that only ACADEMY_ADMIN can create or modify academies.
    PLAYER, PARENT, and COACH must receive 403.
    """

    def setUp(self):
        self.academy = make_academy(name="Guard Test Academy")
        self.list_url = reverse("academy-list")
        self.detail_url = reverse("academy-detail", kwargs={"pk": self.academy.pk})
        self.payload = {"name": "New Academy", "city": "London", "country": "England"}

    def _auth(self, role: str):
        user = make_auth_user(email=f"auth_{uuid.uuid4()}@test.com", role=role)
        self.client.force_authenticate(user=user)

    # -- POST --

    def test_player_cannot_create_academy(self):
        self._auth(User.Role.PLAYER)
        self.assertEqual(
            self.client.post(self.list_url, self.payload, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_parent_cannot_create_academy(self):
        self._auth(User.Role.PARENT)
        self.assertEqual(
            self.client.post(self.list_url, self.payload, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_coach_cannot_create_academy(self):
        self._auth(User.Role.COACH)
        self.assertEqual(
            self.client.post(self.list_url, self.payload, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_academy_admin_can_create_academy(self):
        self._auth(User.Role.ACADEMY_ADMIN)
        response = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # -- PATCH --

    def test_player_cannot_patch_academy(self):
        self._auth(User.Role.PLAYER)
        self.assertEqual(
            self.client.patch(self.detail_url, {"city": "Leeds"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_parent_cannot_patch_academy(self):
        self._auth(User.Role.PARENT)
        self.assertEqual(
            self.client.patch(self.detail_url, {"city": "Leeds"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_coach_cannot_patch_academy(self):
        self._auth(User.Role.COACH)
        self.assertEqual(
            self.client.patch(self.detail_url, {"city": "Leeds"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_academy_admin_can_patch_academy(self):
        self._auth(User.Role.ACADEMY_ADMIN)
        response = self.client.patch(self.detail_url, {"city": "Leeds"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["city"], "Leeds")


# ---------------------------------------------------------------------------
# AcademyStaffMembership model tests
# ---------------------------------------------------------------------------

class AcademyStaffMembershipModelTests(TestCase):

    def setUp(self):
        self.academy = make_academy()
        self.user = make_auth_user(role=User.Role.COACH)

    def test_can_create_staff_membership(self):
        """A staff membership linking a user to an academy can be created."""
        membership = AcademyStaffMembership.objects.create(
            user=self.user,
            academy=self.academy,
        )
        self.assertIsNotNone(membership.pk)
        self.assertEqual(membership.user, self.user)
        self.assertEqual(membership.academy, self.academy)
        self.assertIsNotNone(membership.created_at)

    def test_duplicate_user_academy_raises_integrity_error(self):
        """Creating a duplicate (user, academy) pair raises IntegrityError."""
        from django.db import IntegrityError
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        with self.assertRaises(IntegrityError):
            AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)

    def test_deleting_user_cascades_to_membership(self):
        """Deleting the user removes their staff memberships."""
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        self.assertEqual(AcademyStaffMembership.objects.filter(academy=self.academy).count(), 1)
        self.user.delete()
        self.assertEqual(AcademyStaffMembership.objects.filter(academy=self.academy).count(), 0)

    def test_deleting_academy_cascades_to_membership(self):
        """Deleting the academy removes its staff memberships."""
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        academy_pk = self.academy.pk
        self.academy.delete()
        self.assertEqual(AcademyStaffMembership.objects.filter(academy_id=academy_pk).count(), 0)

    def test_str_returns_expected_format(self):
        """__str__ returns 'email → academy (role)'."""
        membership = AcademyStaffMembership.objects.create(
            user=self.user,
            academy=self.academy,
        )
        expected = f"{self.user.email} → {self.academy.name} ({self.user.role})"
        self.assertEqual(str(membership), expected)

    def test_user_can_be_staff_at_multiple_academies(self):
        """The same user can have memberships at different academies."""
        academy_b = make_academy(name="Arsenal Academy", city="London")
        m1 = AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        m2 = AcademyStaffMembership.objects.create(user=self.user, academy=academy_b)
        self.assertEqual(
            AcademyStaffMembership.objects.filter(user=self.user).count(), 2
        )
        self.assertNotEqual(m1.pk, m2.pk)


# ---------------------------------------------------------------------------
# Academy-level authorization helper tests
# ---------------------------------------------------------------------------

class AcademyStaffPermissionTests(TestCase):
    """
    Unit tests for the object-level academy permission helpers:
      - get_user_academy_ids()
      - require_staff_of_academy()
      - require_academy_admin_of_academy()

    These helpers are pure-function DB checks; no HTTP layer is involved.
    """

    def setUp(self):
        self.academy_a = make_academy(name="Academy Alpha", city="London")
        self.academy_b = make_academy(name="Academy Beta", city="Manchester")
        self.coach = make_auth_user(
            email="coach@test.com", role=User.Role.COACH
        )
        self.admin = make_auth_user(
            email="admin@test.com", role=User.Role.ACADEMY_ADMIN
        )
        self.player_user = make_auth_user(
            email="player@test.com", role=User.Role.PLAYER
        )
        self.parent_user = make_auth_user(
            email="parent@test.com", role=User.Role.PARENT
        )

    # ------------------------------------------------------------------ #
    # get_user_academy_ids                                                 #
    # ------------------------------------------------------------------ #

    def test_get_ids_no_memberships_returns_empty(self):
        """User with no staff memberships returns an empty frozenset."""
        ids = get_user_academy_ids(self.coach)
        self.assertEqual(ids, frozenset())

    def test_get_ids_one_membership(self):
        """User with one membership returns a frozenset containing that academy ID."""
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)
        ids = get_user_academy_ids(self.coach)
        self.assertEqual(ids, frozenset([self.academy_a.pk]))

    def test_get_ids_multiple_memberships(self):
        """User with memberships in two academies returns both IDs."""
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_b)
        ids = get_user_academy_ids(self.coach)
        self.assertEqual(ids, frozenset([self.academy_a.pk, self.academy_b.pk]))

    # ------------------------------------------------------------------ #
    # require_staff_of_academy                                             #
    # ------------------------------------------------------------------ #

    def test_coach_with_membership_passes(self):
        """COACH with an AcademyStaffMembership for the academy passes."""
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)
        # Must not raise
        require_staff_of_academy(self.coach, self.academy_a.pk)

    def test_academy_admin_with_membership_passes(self):
        """ACADEMY_ADMIN with an AcademyStaffMembership for the academy passes."""
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy_a)
        require_staff_of_academy(self.admin, self.academy_a.pk)

    def test_coach_with_membership_in_other_academy_is_denied(self):
        """COACH with a membership in academy B cannot access academy A."""
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_b)
        with self.assertRaises(PermissionDenied):
            require_staff_of_academy(self.coach, self.academy_a.pk)

    def test_coach_with_no_membership_is_denied(self):
        """COACH with no memberships at all is denied."""
        with self.assertRaises(PermissionDenied):
            require_staff_of_academy(self.coach, self.academy_a.pk)

    def test_player_role_is_denied_before_membership_check(self):
        """PLAYER is denied by the role check regardless of any membership."""
        # Even if we grant membership, role check fires first and denies.
        AcademyStaffMembership.objects.create(user=self.player_user, academy=self.academy_a)
        with self.assertRaises(PermissionDenied):
            require_staff_of_academy(self.player_user, self.academy_a.pk)

    def test_parent_role_is_denied_before_membership_check(self):
        """PARENT is denied by the role check regardless of any membership."""
        AcademyStaffMembership.objects.create(user=self.parent_user, academy=self.academy_a)
        with self.assertRaises(PermissionDenied):
            require_staff_of_academy(self.parent_user, self.academy_a.pk)

    def test_nonexistent_academy_id_is_denied(self):
        """A non-existent academy ID is treated as a missing membership (403, not 404)."""
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)
        nonexistent_id = uuid.uuid4()
        with self.assertRaises(PermissionDenied):
            require_staff_of_academy(self.coach, nonexistent_id)

    # ------------------------------------------------------------------ #
    # require_academy_admin_of_academy                                     #
    # ------------------------------------------------------------------ #

    def test_academy_admin_with_membership_passes(self):
        """ACADEMY_ADMIN with an AcademyStaffMembership for the academy passes."""
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy_a)
        require_academy_admin_of_academy(self.admin, self.academy_a.pk)

    def test_coach_with_membership_is_denied_by_role(self):
        """COACH is denied even when holding a membership — admin action requires ACADEMY_ADMIN."""
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)
        with self.assertRaises(PermissionDenied):
            require_academy_admin_of_academy(self.coach, self.academy_a.pk)

    def test_academy_admin_without_membership_is_denied(self):
        """ACADEMY_ADMIN without a membership for the academy is denied."""
        with self.assertRaises(PermissionDenied):
            require_academy_admin_of_academy(self.admin, self.academy_a.pk)

    def test_player_is_denied_by_role(self):
        """PLAYER is denied by the role check."""
        with self.assertRaises(PermissionDenied):
            require_academy_admin_of_academy(self.player_user, self.academy_a.pk)
