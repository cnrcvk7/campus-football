import uuid

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy, AcademyStaffMembership
from apps.players.models import Player
from apps.users.models import User
from .models import Team, PlayerTeamMembership


def make_auth_user(email="team_test@example.com", role=User.Role.COACH) -> User:
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

VALID_PLAYER_DATA = {
    "first_name": "Phil",
    "last_name": "Foden",
    "date_of_birth": "2000-05-28",
    "gender": "M",
}


def make_academy(**overrides) -> Academy:
    defaults = {"name": "City Academy", "city": "Manchester", "country": "England"}
    return Academy.objects.create(**{**defaults, **overrides})


def make_player(**overrides) -> Player:
    return Player.objects.create(**{**VALID_PLAYER_DATA, **overrides})


def make_team(academy: Academy, **overrides) -> Team:
    defaults = {"name": "U15 Boys", "age_group": "U15", "season": "2024/25"}
    return Team.objects.create(academy=academy, **{**defaults, **overrides})


# ---------------------------------------------------------------------------
# Team API tests
# ---------------------------------------------------------------------------

class TeamAPITests(APITestCase):

    def setUp(self):
        self.user = make_auth_user()
        self.client.force_authenticate(user=self.user)
        self.academy = make_academy()
        self.team = make_team(self.academy)
        # POST and PATCH now require staff membership; create it so write tests pass.
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        self.list_url = reverse("team-list")
        self.detail_url = reverse("team-detail", kwargs={"pk": self.team.pk})

    def test_team_creation(self):
        """POST /api/teams/ creates a team and returns 201."""
        payload = {
            "academy": str(self.academy.pk),
            "name": "U12 Girls",
            "age_group": "U12",
            "gender": "F",
            "season": "2024/25",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "U12 Girls")

    def test_team_must_reference_existing_academy(self):
        """POST with a non-existent academy UUID returns 403.

        The staff-membership check treats 'not your academy' and 'non-existent
        academy' identically — both result in no membership row, so the user
        receives 403 rather than 400.  This avoids leaking which academy IDs exist.
        """
        import uuid
        payload = {
            "academy": str(uuid.uuid4()),
            "name": "Orphan Team",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_team_list(self):
        """GET /api/teams/ returns at least one team."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertGreaterEqual(len(results), 1)

    def test_team_retrieve(self):
        """GET /api/teams/{id}/ returns the correct team."""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], self.team.name)
        self.assertEqual(str(response.data["academy"]), str(self.academy.pk))

    def test_team_update(self):
        """PATCH /api/teams/{id}/ updates supplied fields only."""
        response = self.client.patch(
            self.detail_url, {"season": "2025/26"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["season"], "2025/26")
        self.assertEqual(response.data["name"], self.team.name)

    def test_team_delete_not_allowed(self):
        """DELETE must return 405."""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_team_name_required(self):
        """Creating a team without a name must fail."""
        response = self.client.post(
            self.list_url,
            {"academy": str(self.academy.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)


# ---------------------------------------------------------------------------
# PlayerTeamMembership model tests
# ---------------------------------------------------------------------------

class PlayerTeamMembershipTests(TestCase):

    def setUp(self):
        self.player = make_player()
        self.academy = make_academy()
        self.team = make_team(self.academy)

    def test_player_can_join_team(self):
        """A PlayerTeamMembership record can be created."""
        membership = PlayerTeamMembership.objects.create(
            player=self.player,
            team=self.team,
            joined_at="2024-01-15",
        )
        self.assertIsNotNone(membership.pk)
        self.assertEqual(membership.status, PlayerTeamMembership.Status.ACTIVE)
        self.assertIsNone(membership.left_at)

    def test_team_history_is_preserved(self):
        """Closing a team membership and opening a new one preserves both records."""
        team_b = make_team(self.academy, name="U17 Boys", age_group="U17")
        membership_a = PlayerTeamMembership.objects.create(
            player=self.player,
            team=self.team,
            joined_at="2023-09-01",
            left_at="2024-06-30",
            status=PlayerTeamMembership.Status.LEFT,
        )
        membership_b = PlayerTeamMembership.objects.create(
            player=self.player,
            team=team_b,
            joined_at="2024-07-01",
        )
        all_memberships = PlayerTeamMembership.objects.filter(player=self.player)
        self.assertEqual(all_memberships.count(), 2)
        self.assertIn(membership_a, all_memberships)
        self.assertIn(membership_b, all_memberships)

    def test_joined_at_cannot_be_after_left_at(self):
        """Serializer must reject left_at < joined_at."""
        from .serializers import PlayerTeamMembershipSerializer
        data = {
            "player": self.player.pk,
            "team": self.team.pk,
            "joined_at": "2024-06-01",
            "left_at": "2024-01-01",  # before joined_at
            "status": "left",
        }
        serializer = PlayerTeamMembershipSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("left_at", serializer.errors)


# ---------------------------------------------------------------------------
# GET /api/teams/<id>/players/ tests
# ---------------------------------------------------------------------------

class TeamPlayersViewTests(APITestCase):

    def setUp(self):
        self.user = make_auth_user(email="coach_tp@example.com")
        self.client.force_authenticate(user=self.user)
        self.academy = make_academy(name="Test Academy 2")
        self.team = make_team(self.academy, name="U18 Boys")
        self.url = f"/api/teams/{self.team.pk}/players/"

    def test_returns_active_players_only(self):
        """Only players with active membership are returned."""
        active = make_player(first_name="Active", last_name="Player")
        left = make_player(first_name="Left", last_name="Player")
        PlayerTeamMembership.objects.create(
            player=active, team=self.team, joined_at="2024-01-01",
            status=PlayerTeamMembership.Status.ACTIVE,
        )
        PlayerTeamMembership.objects.create(
            player=left, team=self.team, joined_at="2023-01-01", left_at="2024-01-01",
            status=PlayerTeamMembership.Status.LEFT,
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [p["id"] for p in response.data]
        self.assertIn(str(active.pk), ids)
        self.assertNotIn(str(left.pk), ids)

    def test_empty_team_returns_empty_list(self):
        """A team with no active members returns an empty list."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_unknown_team_returns_404(self):
        """404 for a non-existent team UUID."""
        import uuid
        response = self.client.get(f"/api/teams/{uuid.uuid4()}/players/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_requires_authentication(self):
        """Unauthenticated requests get 401."""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Team write-authorization tests
# ---------------------------------------------------------------------------

class TeamWriteAuthorizationTests(APITestCase):
    """
    Verify team write authorization.

    POST (create): COACH or ACADEMY_ADMIN AND AcademyStaffMembership for the target academy.
    PATCH (update): COACH or ACADEMY_ADMIN AND AcademyStaffMembership for the team's academy.
    PLAYER and PARENT are denied by the role check before any membership query.
    """

    def setUp(self):
        self.academy = make_academy(name="Auth Test Academy")
        self.team = make_team(self.academy, name="Auth Test Team")
        self.list_url = reverse("team-list")
        self.detail_url = reverse("team-detail", kwargs={"pk": self.team.pk})
        self.payload = {
            "academy": str(self.academy.pk),
            "name": "New Team",
            "age_group": "U14",
            "season": "2025/26",
        }

    def _auth(self, role: str) -> User:
        user = make_auth_user(email=f"auth_{uuid.uuid4()}@test.com", role=role)
        self.client.force_authenticate(user=user)
        return user

    # -- POST --

    def test_player_cannot_create_team(self):
        self._auth(User.Role.PLAYER)
        self.assertEqual(
            self.client.post(self.list_url, self.payload, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_parent_cannot_create_team(self):
        self._auth(User.Role.PARENT)
        self.assertEqual(
            self.client.post(self.list_url, self.payload, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_coach_with_membership_can_create_team(self):
        user = self._auth(User.Role.COACH)
        AcademyStaffMembership.objects.create(user=user, academy=self.academy)
        response = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_academy_admin_with_membership_can_create_team(self):
        user = self._auth(User.Role.ACADEMY_ADMIN)
        AcademyStaffMembership.objects.create(user=user, academy=self.academy)
        payload = {**self.payload, "name": "Admin Team"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_coach_without_membership_cannot_create_team(self):
        """COACH role alone is not enough — membership for the target academy is required."""
        self._auth(User.Role.COACH)
        response = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_of_other_academy_cannot_create_team_here(self):
        """COACH with membership in a different academy cannot create a team in this one."""
        other_academy = make_academy(name="Other Academy", city="Bristol")
        user = self._auth(User.Role.COACH)
        AcademyStaffMembership.objects.create(user=user, academy=other_academy)
        response = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # -- PATCH --

    def test_player_cannot_patch_team(self):
        self._auth(User.Role.PLAYER)
        self.assertEqual(
            self.client.patch(self.detail_url, {"season": "2026/27"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_parent_cannot_patch_team(self):
        self._auth(User.Role.PARENT)
        self.assertEqual(
            self.client.patch(self.detail_url, {"season": "2026/27"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_coach_with_membership_can_patch_team(self):
        user = self._auth(User.Role.COACH)
        AcademyStaffMembership.objects.create(user=user, academy=self.academy)
        response = self.client.patch(self.detail_url, {"season": "2026/27"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["season"], "2026/27")

    def test_academy_admin_with_membership_can_patch_team(self):
        user = self._auth(User.Role.ACADEMY_ADMIN)
        AcademyStaffMembership.objects.create(user=user, academy=self.academy)
        response = self.client.patch(self.detail_url, {"age_group": "U16"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["age_group"], "U16")

    def test_coach_without_membership_cannot_patch_team(self):
        """COACH role alone is not enough — membership for the team's academy is required."""
        self._auth(User.Role.COACH)
        response = self.client.patch(self.detail_url, {"season": "2026/27"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_of_other_academy_cannot_patch_team_here(self):
        """COACH with membership in a different academy cannot patch a team in this one."""
        other_academy = make_academy(name="Other Academy 2", city="Leeds")
        user = self._auth(User.Role.COACH)
        AcademyStaffMembership.objects.create(user=user, academy=other_academy)
        response = self.client.patch(self.detail_url, {"season": "2026/27"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
