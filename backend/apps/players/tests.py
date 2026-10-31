import re

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User
from .models import Player


def make_auth_user(email="test@example.com") -> User:
    return User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="Test",
        last_name="User",
        role=User.Role.COACH,
    )

# lazy imports for cross-domain models (used only in history tests)
# imported inside test methods to avoid issues during app loading

# ---------------------------------------------------------------------------
# Shared fixture data
# ---------------------------------------------------------------------------

VALID_DATA = {
    "first_name": "Marcus",
    "last_name": "Rashford",
    "date_of_birth": "2000-10-31",
    "gender": "M",
    "preferred_position": "LW",
}


def make_player(**overrides) -> Player:
    return Player.objects.create(**{**VALID_DATA, **overrides})


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------

class PlayerModelTests(TestCase):

    def test_player_can_be_created(self):
        """A player is persisted with a PK after save."""
        player = make_player()
        self.assertIsNotNone(player.pk)
        self.assertTrue(Player.objects.filter(pk=player.pk).exists())

    def test_football_id_is_auto_generated(self):
        """Football ID is populated automatically on first save."""
        player = make_player()
        self.assertTrue(bool(player.football_id))

    def test_football_id_format(self):
        """Football ID matches the CF-XXXXXXXX pattern (uppercase alphanumeric)."""
        player = make_player()
        self.assertRegex(player.football_id, r"^CF-[A-Z0-9]{8}$")

    def test_football_id_is_unique(self):
        """Two different players get different Football IDs."""
        player1 = make_player()
        player2 = make_player(first_name="Jadon", last_name="Sancho")
        self.assertNotEqual(player1.football_id, player2.football_id)

    def test_football_id_does_not_change_on_update(self):
        """Updating player fields must not regenerate the Football ID."""
        player = make_player()
        original_id = player.football_id
        player.first_name = "Updated"
        player.jersey_number = 10
        player.save()
        player.refresh_from_db()
        self.assertEqual(player.football_id, original_id)


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

class PlayerAPITests(APITestCase):

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership

        self.user = make_auth_user()
        self.client.force_authenticate(user=self.user)
        self.academy = Academy.objects.create(
            name="Test Academy", city="London", country="England"
        )
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        self.player = make_player()
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2026-01-01"
        )
        self.list_url = reverse("player-list")
        self.detail_url = reverse("player-detail", kwargs={"pk": self.player.pk})

    def test_player_api_list(self):
        """GET /api/players/ returns HTTP 200 with at least one player."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # DefaultRouter may return a paginated dict or a plain list
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertGreaterEqual(len(results), 1)

    def test_player_api_create(self):
        """POST /api/players/ creates a player and returns Football ID."""
        payload = {
            "first_name": "Phil",
            "last_name": "Foden",
            "date_of_birth": "2000-05-28",
            "gender": "M",
            "preferred_position": "CAM",
            "academy": str(self.academy.pk),
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("football_id", response.data)
        self.assertRegex(response.data["football_id"], r"^CF-[A-Z0-9]{8}$")
        self.assertEqual(Player.objects.count(), 2)

    def test_player_api_retrieve(self):
        """GET /api/players/{id}/ returns the correct player."""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["football_id"], self.player.football_id)
        self.assertEqual(response.data["first_name"], self.player.first_name)

    def test_player_api_partial_update(self):
        """PATCH /api/players/{id}/ updates only supplied fields."""
        response = self.client.patch(
            self.detail_url,
            {"jersey_number": 10},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["jersey_number"], 10)
        # Immutable fields must not change
        self.assertEqual(response.data["football_id"], self.player.football_id)
        self.assertEqual(response.data["first_name"], self.player.first_name)

    def test_player_api_delete(self):
        """DELETE /api/players/{id}/ removes the player and returns 204 (ACADEMY_ADMIN only).

        Under strict scoping the player has an academy membership, so the
        delete actually triggers a 409 (protected history).  Use a fresh
        player with no memberships visible to this admin via superuser.
        """
        from apps.academies.models import AcademyStaffMembership

        admin = User.objects.create_user(
            email="admin_del@example.com", password="testpass123",
            first_name="Admin", last_name="Del", role=User.Role.ACADEMY_ADMIN,
            is_superuser=True,
        )
        self.client.force_authenticate(user=admin)
        fresh_player = make_player(first_name="Fresh", last_name="Del")
        url = reverse("player-detail", kwargs={"pk": fresh_player.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Player.objects.filter(pk=fresh_player.pk).exists())

    def test_delete_unknown_player_returns_404(self):
        """DELETE on a non-existent player UUID returns 404 (ACADEMY_ADMIN required)."""
        import uuid
        admin = User.objects.create_user(
            email="admin_del404@example.com", password="testpass123",
            first_name="Admin", last_name="Del", role=User.Role.ACADEMY_ADMIN,
        )
        self.client.force_authenticate(user=admin)
        url = reverse("player-detail", kwargs={"pk": uuid.uuid4()})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_requires_authentication(self):
        """DELETE /api/players/{id}/ returns 401 for unauthenticated requests."""
        self.client.force_authenticate(user=None)
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ---- Validation tests ----

    def test_create_rejects_future_date_of_birth(self):
        """A date of birth in the future must be rejected."""
        payload = {**VALID_DATA, "date_of_birth": "2099-01-01", "academy": str(self.academy.pk)}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_of_birth", response.data)

    def test_create_rejects_invalid_jersey_number(self):
        """Jersey numbers outside 1–99 must be rejected."""
        payload = {**VALID_DATA, "jersey_number": 0, "academy": str(self.academy.pk)}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_football_id_is_read_only_in_api(self):
        """Attempting to set football_id via the API must be ignored."""
        payload = {**VALID_DATA, "football_id": "CF-HACKED01", "academy": str(self.academy.pk)}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(response.data["football_id"], "CF-HACKED01")


# ---------------------------------------------------------------------------
# Player history endpoint tests
# ---------------------------------------------------------------------------

class PlayerHistoryAPITests(APITestCase):

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
        from apps.teams.models import Team, PlayerTeamMembership

        self.user = make_auth_user(email="history@example.com")
        self.client.force_authenticate(user=self.user)
        self.player = make_player()
        self.academy = Academy.objects.create(
            name="Test Academy", city="London", country="England"
        )
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        self.team = Team.objects.create(
            academy=self.academy,
            name="U15 Boys",
            age_group="U15",
            season="2024/25",
        )
        self.academy_membership = PlayerAcademyMembership.objects.create(
            player=self.player,
            academy=self.academy,
            joined_at="2024-01-01",
        )
        self.team_membership = PlayerTeamMembership.objects.create(
            player=self.player,
            team=self.team,
            joined_at="2024-01-15",
        )
        self.history_url = reverse("player-history", kwargs={"pk": self.player.pk})

    def test_history_returns_academy_history(self):
        """GET /api/players/{id}/history/ includes academy membership data."""
        response = self.client.get(self.history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("academy_history", response.data)
        academy_history = response.data["academy_history"]
        self.assertEqual(len(academy_history), 1)
        self.assertEqual(academy_history[0]["academy"]["name"], "Test Academy")
        self.assertEqual(str(academy_history[0]["joined_at"]), "2024-01-01")
        self.assertIsNone(academy_history[0]["left_at"])

    def test_history_returns_team_history(self):
        """GET /api/players/{id}/history/ includes team membership data."""
        response = self.client.get(self.history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("team_history", response.data)
        team_history = response.data["team_history"]
        self.assertEqual(len(team_history), 1)
        self.assertEqual(team_history[0]["team"]["name"], "U15 Boys")
        self.assertEqual(team_history[0]["team"]["academy_name"], "Test Academy")
        self.assertEqual(str(team_history[0]["joined_at"]), "2024-01-15")

    def test_history_returns_empty_lists_for_new_player(self):
        """A player with an academy enrollment but no team history gets empty team list.

        Under strict scoping, only players enrolled in the user's academy are
        visible, so the player must have at least one PlayerAcademyMembership.
        """
        from apps.academies.models import PlayerAcademyMembership

        new_player = make_player(first_name="New", last_name="Player")
        PlayerAcademyMembership.objects.create(
            player=new_player, academy=self.academy, joined_at="2026-01-01"
        )
        url = reverse("player-history", kwargs={"pk": new_player.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Player has one academy membership but no team history.
        self.assertEqual(len(response.data["academy_history"]), 1)
        self.assertEqual(response.data["team_history"], [])

    def test_history_not_found_for_unknown_player(self):
        """History endpoint on a non-existent player ID returns 404."""
        import uuid
        url = reverse("player-history", kwargs={"pk": uuid.uuid4()})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Membership API tests
# ---------------------------------------------------------------------------

class MembershipAPITests(APITestCase):
    """
    Tests for POST/PATCH /api/players/{id}/academy-memberships/
                  and    /api/players/{id}/team-memberships/
    """

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership
        from apps.teams.models import Team

        self.user = make_auth_user(email="membership@example.com")
        self.client.force_authenticate(user=self.user)
        self.player = make_player()
        self.academy = Academy.objects.create(
            name="Membership Academy", city="London", country="England"
        )
        self.academy2 = Academy.objects.create(
            name="Second Academy", city="Liverpool", country="England"
        )
        self.team = Team.objects.create(
            academy=self.academy,
            name="U16 Boys",
            age_group="U16",
            season="2025/26",
        )
        self.team2 = Team.objects.create(
            academy=self.academy,
            name="U18 Boys",
            age_group="U18",
            season="2025/26",
        )
        # Staff membership required for object-level authorization checks.
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        self.academy_memberships_url = reverse(
            "player-academy-membership-list",
            kwargs={"player_pk": self.player.pk},
        )
        self.team_memberships_url = reverse(
            "player-team-membership-list",
            kwargs={"player_pk": self.player.pk},
        )

    # ------------------------------------------------------------------
    # 1. Create academy membership through API
    # ------------------------------------------------------------------

    def test_create_academy_membership(self):
        """POST /api/players/{id}/academy-memberships/ creates a membership."""
        payload = {"academy": str(self.academy.pk), "joined_at": "2026-01-01"}
        response = self.client.post(self.academy_memberships_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(str(response.data["academy"]), str(self.academy.pk))
        self.assertEqual(str(response.data["joined_at"]), "2026-01-01")
        self.assertEqual(response.data["status"], "active")
        self.assertIsNone(response.data["left_at"])

    # ------------------------------------------------------------------
    # 2. Create team membership through API
    # ------------------------------------------------------------------

    def test_create_team_membership(self):
        """POST /api/players/{id}/team-memberships/ creates a membership."""
        payload = {"team": str(self.team.pk), "joined_at": "2026-01-15"}
        response = self.client.post(self.team_memberships_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(str(response.data["team"]), str(self.team.pk))
        self.assertEqual(str(response.data["joined_at"]), "2026-01-15")
        self.assertEqual(response.data["status"], "active")
        self.assertIsNone(response.data["left_at"])

    # ------------------------------------------------------------------
    # 3. Update academy membership
    # ------------------------------------------------------------------

    def test_update_academy_membership(self):
        """PATCH .../academy-memberships/{id}/ updates left_at and status."""
        from apps.academies.models import PlayerAcademyMembership
        membership = PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2025-01-01"
        )
        url = reverse(
            "player-academy-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": membership.pk},
        )
        response = self.client.patch(
            url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["left_at"]), "2025-12-31")
        self.assertEqual(response.data["status"], "left")

    # ------------------------------------------------------------------
    # 4. Update team membership
    # ------------------------------------------------------------------

    def test_update_team_membership(self):
        """PATCH .../team-memberships/{id}/ updates left_at and status."""
        from apps.teams.models import PlayerTeamMembership
        membership = PlayerTeamMembership.objects.create(
            player=self.player, team=self.team, joined_at="2025-01-01"
        )
        url = reverse(
            "player-team-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": membership.pk},
        )
        response = self.client.patch(
            url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["left_at"]), "2025-12-31")
        self.assertEqual(response.data["status"], "left")

    # ------------------------------------------------------------------
    # 5. Reject invalid player ID
    # ------------------------------------------------------------------

    def test_reject_invalid_player_id(self):
        """POST to a non-existent player UUID returns 404."""
        import uuid
        url = reverse(
            "player-academy-membership-list",
            kwargs={"player_pk": uuid.uuid4()},
        )
        response = self.client.post(
            url, {"academy": str(self.academy.pk), "joined_at": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ------------------------------------------------------------------
    # 6. Reject invalid academy ID
    # ------------------------------------------------------------------

    def test_reject_invalid_academy_id(self):
        """POST with a non-existent academy UUID returns 400."""
        import uuid
        response = self.client.post(
            self.academy_memberships_url,
            {"academy": str(uuid.uuid4()), "joined_at": "2026-01-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("academy", response.data)

    # ------------------------------------------------------------------
    # 7. Reject invalid team ID
    # ------------------------------------------------------------------

    def test_reject_invalid_team_id(self):
        """POST with a non-existent team UUID returns 400."""
        import uuid
        response = self.client.post(
            self.team_memberships_url,
            {"team": str(uuid.uuid4()), "joined_at": "2026-01-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("team", response.data)

    # ------------------------------------------------------------------
    # 8. Reject left_at < joined_at
    # ------------------------------------------------------------------

    def test_reject_left_at_before_joined_at_academy(self):
        """Academy membership: left_at before joined_at is rejected with 400."""
        response = self.client.post(
            self.academy_memberships_url,
            {
                "academy": str(self.academy.pk),
                "joined_at": "2026-06-01",
                "left_at": "2026-01-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("left_at", response.data)

    def test_reject_left_at_before_joined_at_team(self):
        """Team membership: left_at before joined_at is rejected with 400."""
        response = self.client.post(
            self.team_memberships_url,
            {
                "team": str(self.team.pk),
                "joined_at": "2026-06-01",
                "left_at": "2026-01-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("left_at", response.data)

    # ------------------------------------------------------------------
    # 9. Prevent modifying player through membership update
    # ------------------------------------------------------------------

    def test_cannot_modify_player_through_academy_membership_update(self):
        """Sending player UUID in PATCH body must be silently ignored."""
        from apps.academies.models import PlayerAcademyMembership
        other_player = make_player(first_name="Other", last_name="Player")
        membership = PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2025-01-01"
        )
        url = reverse(
            "player-academy-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": membership.pk},
        )
        # Sending a different player UUID — it is not a field; must be silently ignored.
        response = self.client.patch(
            url, {"player": str(other_player.pk), "left_at": "2025-06-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        membership.refresh_from_db()
        self.assertEqual(membership.player_id, self.player.pk)

    # ------------------------------------------------------------------
    # 10. Prevent modifying academy/team through membership update
    # ------------------------------------------------------------------

    def test_cannot_modify_academy_through_update(self):
        """Sending a new academy UUID in PATCH must be silently ignored."""
        from apps.academies.models import PlayerAcademyMembership
        membership = PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2025-01-01"
        )
        url = reverse(
            "player-academy-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": membership.pk},
        )
        response = self.client.patch(
            url,
            {"academy": str(self.academy2.pk), "left_at": "2025-06-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        membership.refresh_from_db()
        # academy must not have changed
        self.assertEqual(membership.academy_id, self.academy.pk)

    def test_cannot_modify_team_through_update(self):
        """Sending a new team UUID in PATCH must be silently ignored."""
        from apps.teams.models import PlayerTeamMembership
        membership = PlayerTeamMembership.objects.create(
            player=self.player, team=self.team, joined_at="2025-01-01"
        )
        url = reverse(
            "player-team-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": membership.pk},
        )
        response = self.client.patch(
            url,
            {"team": str(self.team2.pk), "left_at": "2025-06-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        membership.refresh_from_db()
        # team must not have changed
        self.assertEqual(membership.team_id, self.team.pk)

    # ------------------------------------------------------------------
    # 11. History endpoint reflects memberships created through API
    # ------------------------------------------------------------------

    def test_history_reflects_api_created_memberships(self):
        """Memberships created via the API appear in GET /api/players/{id}/history/."""
        # Create an academy membership via API
        self.client.post(
            self.academy_memberships_url,
            {"academy": str(self.academy.pk), "joined_at": "2026-01-01"},
            format="json",
        )
        # Create a team membership via API
        self.client.post(
            self.team_memberships_url,
            {"team": str(self.team.pk), "joined_at": "2026-01-15"},
            format="json",
        )

        history_url = reverse("player-history", kwargs={"pk": self.player.pk})
        response = self.client.get(history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        academy_ids = [str(e["academy"]["id"]) for e in response.data["academy_history"]]
        self.assertIn(str(self.academy.pk), academy_ids)

        team_ids = [str(e["team"]["id"]) for e in response.data["team_history"]]
        self.assertIn(str(self.team.pk), team_ids)

    # ------------------------------------------------------------------
    # Duplicate active membership guard
    # ------------------------------------------------------------------

    def test_duplicate_active_academy_membership_rejected(self):
        """Creating a second active membership at the same academy is rejected."""
        payload = {"academy": str(self.academy.pk), "joined_at": "2026-01-01"}
        self.client.post(self.academy_memberships_url, payload, format="json")
        # Second attempt — same player + same academy + active
        response = self.client.post(self.academy_memberships_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_active_team_membership_rejected(self):
        """Creating a second active membership on the same team is rejected."""
        payload = {"team": str(self.team.pk), "joined_at": "2026-01-01"}
        self.client.post(self.team_memberships_url, payload, format="json")
        response = self.client.post(self.team_memberships_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Search and filter tests
# ---------------------------------------------------------------------------

class PlayerSearchAPITests(APITestCase):

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership

        self.user = make_auth_user(email="search@example.com")
        self.client.force_authenticate(user=self.user)
        self.academy = Academy.objects.create(
            name="Search Academy", city="London", country="England"
        )
        AcademyStaffMembership.objects.create(user=self.user, academy=self.academy)
        self.list_url = reverse("player-list")

        self.rashford = make_player(
            first_name="Marcus", last_name="Rashford",
            date_of_birth="2000-10-31", preferred_position="LW",
        )
        self.foden = Player.objects.create(
            first_name="Phil", last_name="Foden",
            date_of_birth="2000-05-28", gender="M", preferred_position="CAM",
        )
        self.salah = Player.objects.create(
            first_name="Mohamed", last_name="Salah",
            date_of_birth="1992-06-15", gender="M", preferred_position="RW",
        )
        # Enroll all players in the coach's academy so they are visible.
        for player in (self.rashford, self.foden, self.salah):
            PlayerAcademyMembership.objects.create(
                player=player, academy=self.academy, joined_at="2026-01-01"
            )

    def _results(self, response):
        data = response.data
        return data["results"] if isinstance(data, dict) and "results" in data else data

    # -- ?search= --

    def test_search_by_first_name(self):
        """?search=phil returns only players whose first name matches."""
        response = self.client.get(self.list_url, {"search": "phil"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["first_name"], "Phil")

    def test_search_by_last_name(self):
        """?search=salah returns only players whose last name matches."""
        response = self.client.get(self.list_url, {"search": "salah"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["last_name"], "Salah")

    def test_search_by_football_id(self):
        """?search=<football_id> returns the matching player."""
        response = self.client.get(self.list_url, {"search": self.foden.football_id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["football_id"], self.foden.football_id)

    def test_search_case_insensitive(self):
        """Search is case-insensitive."""
        response = self.client.get(self.list_url, {"search": "MARCUS"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["first_name"], "Marcus")

    def test_search_partial_match(self):
        """Partial name match returns all players whose name contains the term."""
        response = self.client.get(self.list_url, {"search": "mo"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        first_names = [r["first_name"] for r in results]
        self.assertIn("Mohamed", first_names)

    def test_search_no_match_returns_empty(self):
        """?search=<nonexistent> returns an empty list."""
        response = self.client.get(self.list_url, {"search": "zzznotaplayer"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 0)

    def test_empty_search_returns_all(self):
        """?search= (blank) returns all players."""
        response = self.client.get(self.list_url, {"search": ""})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertGreaterEqual(len(results), 3)

    # -- ?position= --

    def test_filter_by_position(self):
        """?position=LW returns only left-wingers."""
        response = self.client.get(self.list_url, {"position": "LW"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["preferred_position"], "LW")

    def test_filter_by_position_no_match_returns_empty(self):
        """?position=GK returns empty when no goalkeepers exist."""
        response = self.client.get(self.list_url, {"position": "GK"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 0)

    # -- combined --

    def test_search_and_position_combined(self):
        """?search=a&position=RW returns only right-wingers whose name contains 'a'."""
        response = self.client.get(self.list_url, {"search": "a", "position": "RW"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["last_name"], "Salah")

    # -- ?ordering= --

    def test_ordering_by_last_name(self):
        """?ordering=last_name returns players in alphabetical order by last name."""
        response = self.client.get(self.list_url, {"ordering": "last_name"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._results(response)
        last_names = [r["last_name"] for r in results]
        self.assertEqual(last_names, sorted(last_names))


# ---------------------------------------------------------------------------
# Per-player read authorisation tests
#
# Covers GET /api/players/{id}/ and GET /api/players/{id}/history/ after
# the PlayerViewSet.retrieve and history overrides were added to enforce the
# same access rules as the other player-scoped endpoints.
#
# Access matrix
# ─────────────
# PLAYER        own player  → 200     other player → 404
# COACH         any player  → 200
# ACADEMY_ADMIN any player  → 200
# PARENT linked     player  → 200
# PARENT unlinked   player  → 404
# unauthenticated           → 401
# ---------------------------------------------------------------------------

def _make_user(role, email, password="testpass"):
    return User.objects.create_user(
        email=email, password=password,
        first_name="Test", last_name="User", role=role,
    )


def _make_player(user=None):
    p = Player.objects.create(
        first_name="Jane", last_name="Smith",
        date_of_birth="2006-03-10", gender="F",
    )
    if user is not None:
        p.user = user
        p.save()
    return p


class PlayerRetrieveAuthorizationTests(APITestCase):
    """Authorization tests for GET /api/players/{id}/."""

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
        from apps.users.models import ParentPlayerLink

        self.coach     = _make_user(User.Role.COACH,         "coach_r@test.com")
        self.admin     = _make_user(User.Role.ACADEMY_ADMIN, "admin_r@test.com")
        self.p_user    = _make_user(User.Role.PLAYER,        "player_r@test.com")
        self.player    = _make_player(user=self.p_user)
        self.other     = _make_player()                    # no user link
        self.parent    = _make_user(User.Role.PARENT,        "parent_r@test.com")
        self.stranger  = _make_user(User.Role.PARENT,        "stranger_r@test.com")
        ParentPlayerLink.objects.create(parent=self.parent, player=self.player)

        # Academy fixtures so coach/admin can read players enrolled in their academy.
        self.academy = Academy.objects.create(name="Retrieve Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        PlayerAcademyMembership.objects.create(player=self.player, academy=self.academy, joined_at="2026-01-01")
        PlayerAcademyMembership.objects.create(player=self.other, academy=self.academy, joined_at="2026-01-01")

    def _url(self, player):
        return reverse("player-detail", kwargs={"pk": player.pk})

    def test_player_reads_own_record(self):
        self.client.force_authenticate(self.p_user)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_200_OK)

    def test_player_cannot_read_other_record(self):
        self.client.force_authenticate(self.p_user)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_reads_any_player(self):
        self.client.force_authenticate(self.coach)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_200_OK)

    def test_admin_reads_any_player(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_200_OK)

    def test_linked_parent_reads_linked_player(self):
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_200_OK)

    def test_unlinked_parent_cannot_read_any_player(self):
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_404_NOT_FOUND)

    def test_parent_linked_to_a_cannot_read_b(self):
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_is_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_401_UNAUTHORIZED)


class PlayerHistoryAuthorizationTests(APITestCase):
    """Authorization tests for GET /api/players/{id}/history/."""

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
        from apps.users.models import ParentPlayerLink

        self.coach     = _make_user(User.Role.COACH,         "coach_h@test.com")
        self.admin     = _make_user(User.Role.ACADEMY_ADMIN, "admin_h@test.com")
        self.p_user    = _make_user(User.Role.PLAYER,        "player_h@test.com")
        self.player    = _make_player(user=self.p_user)
        self.other     = _make_player()
        self.parent    = _make_user(User.Role.PARENT,        "parent_h@test.com")
        self.stranger  = _make_user(User.Role.PARENT,        "stranger_h@test.com")
        ParentPlayerLink.objects.create(parent=self.parent, player=self.player)

        # Academy fixtures so coach/admin can read history for players enrolled in their academy.
        self.academy = Academy.objects.create(name="History Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        PlayerAcademyMembership.objects.create(player=self.player, academy=self.academy, joined_at="2026-01-01")
        PlayerAcademyMembership.objects.create(player=self.other, academy=self.academy, joined_at="2026-01-01")

    def _url(self, player):
        return reverse("player-history", kwargs={"pk": player.pk})

    def test_player_reads_own_history(self):
        self.client.force_authenticate(self.p_user)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_200_OK)

    def test_player_cannot_read_other_history(self):
        self.client.force_authenticate(self.p_user)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_reads_any_history(self):
        self.client.force_authenticate(self.coach)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_200_OK)

    def test_admin_reads_any_history(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_200_OK)

    def test_linked_parent_reads_linked_player_history(self):
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_200_OK)

    def test_unlinked_parent_cannot_read_any_history(self):
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_404_NOT_FOUND)

    def test_parent_linked_to_a_cannot_read_b_history(self):
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.get(self._url(self.other)).status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_is_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self._url(self.player)).status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Player list authorisation tests
#
# Covers GET /api/players/ queryset filtering added to get_queryset().
#
# Access matrix
# ─────────────
# COACH / ACADEMY_ADMIN → all players
# PLAYER                → own player record only (filtered by user=request.user)
# PARENT                → linked players only (filtered via ParentPlayerLink)
# unauthenticated       → 401
# ---------------------------------------------------------------------------

class PlayerListAuthorizationTests(APITestCase):
    """Authorization and queryset-filtering tests for GET /api/players/."""

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
        from apps.users.models import ParentPlayerLink

        self.academy  = Academy.objects.create(name="List Academy", city="London", country="England")
        self.coach    = _make_user(User.Role.COACH,         "coach_l@test.com")
        self.admin    = _make_user(User.Role.ACADEMY_ADMIN, "admin_l@test.com")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        self.p_user   = _make_user(User.Role.PLAYER,        "player_l@test.com")
        self.player_a = _make_player(user=self.p_user)   # linked to p_user
        self.player_b = _make_player()                   # unlinked
        # Enroll both players in the academy so coach/admin can see them.
        PlayerAcademyMembership.objects.create(player=self.player_a, academy=self.academy, joined_at="2026-01-01")
        PlayerAcademyMembership.objects.create(player=self.player_b, academy=self.academy, joined_at="2026-01-01")
        self.parent   = _make_user(User.Role.PARENT,        "parent_l@test.com")
        ParentPlayerLink.objects.create(parent=self.parent, player=self.player_a)

        self.list_url = reverse("player-list")

    def _results(self, response):
        data = response.data
        return data["results"] if isinstance(data, dict) and "results" in data else data

    def test_coach_sees_all_players(self):
        self.client.force_authenticate(self.coach)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [str(r["id"]) for r in self._results(response)]
        self.assertIn(str(self.player_a.pk), ids)
        self.assertIn(str(self.player_b.pk), ids)

    def test_admin_sees_all_players(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [str(r["id"]) for r in self._results(response)]
        self.assertIn(str(self.player_a.pk), ids)
        self.assertIn(str(self.player_b.pk), ids)

    def test_player_sees_only_own_record(self):
        self.client.force_authenticate(self.p_user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [str(r["id"]) for r in self._results(response)]
        self.assertIn(str(self.player_a.pk), ids)
        self.assertNotIn(str(self.player_b.pk), ids)

    def test_player_with_no_linked_record_sees_empty_list(self):
        unlinked = _make_user(User.Role.PLAYER, "player_nolink_l@test.com")
        self.client.force_authenticate(unlinked)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._results(response)), 0)

    def test_parent_sees_only_linked_players(self):
        self.client.force_authenticate(self.parent)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [str(r["id"]) for r in self._results(response)]
        self.assertIn(str(self.player_a.pk), ids)
        self.assertNotIn(str(self.player_b.pk), ids)

    def test_parent_with_no_links_sees_empty_list(self):
        unlinked_parent = _make_user(User.Role.PARENT, "parent_nolink_l@test.com")
        self.client.force_authenticate(unlinked_parent)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._results(response)), 0)

    def test_unauthenticated_is_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Player write authorisation tests
#
# Covers POST /api/players/, PATCH /api/players/{id}/, DELETE /api/players/{id}/
#
# Access matrix
# ─────────────
# COACH / ACADEMY_ADMIN → allowed (201 / 200 / 204)
# PLAYER / PARENT       → 403
# unauthenticated       → 401
# ---------------------------------------------------------------------------

class PlayerWriteAuthorizationTests(APITestCase):
    """Authorization tests for POST, PATCH, DELETE /api/players/{id}/."""

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership

        self.academy = Academy.objects.create(name="Write Academy", city="London", country="England")
        self.coach   = _make_user(User.Role.COACH,         "coach_w@test.com")
        self.admin   = _make_user(User.Role.ACADEMY_ADMIN, "admin_w@test.com")
        self.p_user  = _make_user(User.Role.PLAYER,        "player_w@test.com")
        self.parent  = _make_user(User.Role.PARENT,        "parent_w@test.com")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        self.target  = _make_player()
        PlayerAcademyMembership.objects.create(player=self.target, academy=self.academy, joined_at="2026-01-01")
        self.list_url   = reverse("player-list")
        self.detail_url = reverse("player-detail", kwargs={"pk": self.target.pk})

    # -- POST --

    def test_coach_can_create_player(self):
        self.client.force_authenticate(self.coach)
        payload = {**VALID_DATA, "academy": str(self.academy.pk)}
        self.assertEqual(self.client.post(self.list_url, payload, format="json").status_code, status.HTTP_201_CREATED)

    def test_admin_can_create_player(self):
        self.client.force_authenticate(self.admin)
        payload = {**VALID_DATA, "academy": str(self.academy.pk)}
        self.assertEqual(self.client.post(self.list_url, payload, format="json").status_code, status.HTTP_201_CREATED)

    def test_player_cannot_create_player(self):
        self.client.force_authenticate(self.p_user)
        self.assertEqual(self.client.post(self.list_url, VALID_DATA, format="json").status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_create_player(self):
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.post(self.list_url, VALID_DATA, format="json").status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_create_player(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.post(self.list_url, VALID_DATA, format="json").status_code, status.HTTP_401_UNAUTHORIZED)

    # -- PATCH --

    def test_coach_can_update_player(self):
        self.client.force_authenticate(self.coach)
        self.assertEqual(self.client.patch(self.detail_url, {"jersey_number": 9}, format="json").status_code, status.HTTP_200_OK)

    def test_admin_can_update_player(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(self.detail_url, {"jersey_number": 7}, format="json").status_code, status.HTTP_200_OK)

    def test_player_cannot_update_player(self):
        self.client.force_authenticate(self.p_user)
        self.assertEqual(self.client.patch(self.detail_url, {"jersey_number": 9}, format="json").status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_update_player(self):
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.patch(self.detail_url, {"jersey_number": 9}, format="json").status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_update_player(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.patch(self.detail_url, {"jersey_number": 9}, format="json").status_code, status.HTTP_401_UNAUTHORIZED)

    # -- DELETE --

    def test_coach_cannot_delete_player(self):
        from apps.academies.models import PlayerAcademyMembership

        self.client.force_authenticate(self.coach)
        player = _make_player()
        PlayerAcademyMembership.objects.create(player=player, academy=self.academy, joined_at="2026-01-01")
        url = reverse("player-detail", kwargs={"pk": player.pk})
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_delete_player(self):
        """ACADEMY_ADMIN can delete a player with no protected history.

        Under strict scoping a non-superuser admin can only see enrolled
        players, but deleting an enrolled player triggers 409.  Use a
        superuser admin to test the basic deletion path.
        """
        superadmin = User.objects.create_user(
            email="superadmin_w@test.com", password="testpass",
            first_name="Super", last_name="Admin",
            role=User.Role.ACADEMY_ADMIN, is_superuser=True,
        )
        self.client.force_authenticate(superadmin)
        player = _make_player()
        url = reverse("player-detail", kwargs={"pk": player.pk})
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_204_NO_CONTENT)

    def test_player_cannot_delete_player(self):
        self.client.force_authenticate(self.p_user)
        self.assertEqual(self.client.delete(self.detail_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_delete_player(self):
        self.client.force_authenticate(self.parent)
        self.assertEqual(self.client.delete(self.detail_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_delete_player(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.delete(self.detail_url).status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Membership write authorisation tests
#
# Covers POST /api/players/{id}/academy-memberships/
#         and /api/players/{id}/team-memberships/
#
# Access matrix
# ─────────────
# COACH / ACADEMY_ADMIN → 201
# PLAYER / PARENT       → 403
# unauthenticated       → 401
# ---------------------------------------------------------------------------

class MembershipWriteAuthorizationTests(APITestCase):
    """Authorization tests for membership create endpoints."""

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership
        from apps.teams.models import Team

        self.coach   = _make_user(User.Role.COACH,         "coach_ma@test.com")
        self.admin   = _make_user(User.Role.ACADEMY_ADMIN, "admin_ma@test.com")
        self.p_user  = _make_user(User.Role.PLAYER,        "player_ma@test.com")
        self.parent  = _make_user(User.Role.PARENT,        "parent_ma@test.com")
        self.target  = _make_player()
        self.academy = Academy.objects.create(name="Auth Academy", city="London", country="England")
        self.team    = Team.objects.create(academy=self.academy, name="U14 Boys", age_group="U14", season="2025/26")
        # Staff memberships so the "can" tests exercise the authorized workflow.
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        self.acad_url = reverse("player-academy-membership-list", kwargs={"player_pk": self.target.pk})
        self.team_url = reverse("player-team-membership-list",    kwargs={"player_pk": self.target.pk})

    def test_coach_can_create_academy_membership(self):
        self.client.force_authenticate(self.coach)
        response = self.client.post(self.acad_url, {"academy": str(self.academy.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_admin_can_create_academy_membership(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(self.acad_url, {"academy": str(self.academy.pk), "joined_at": "2026-02-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_player_cannot_create_academy_membership(self):
        self.client.force_authenticate(self.p_user)
        response = self.client.post(self.acad_url, {"academy": str(self.academy.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_create_academy_membership(self):
        self.client.force_authenticate(self.parent)
        response = self.client.post(self.acad_url, {"academy": str(self.academy.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_create_academy_membership(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.acad_url, {"academy": str(self.academy.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_coach_can_create_team_membership(self):
        self.client.force_authenticate(self.coach)
        response = self.client.post(self.team_url, {"team": str(self.team.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_admin_can_create_team_membership(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(self.team_url, {"team": str(self.team.pk), "joined_at": "2026-02-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_player_cannot_create_team_membership(self):
        self.client.force_authenticate(self.p_user)
        response = self.client.post(self.team_url, {"team": str(self.team.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_create_team_membership(self):
        self.client.force_authenticate(self.parent)
        response = self.client.post(self.team_url, {"team": str(self.team.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_create_team_membership(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.team_url, {"team": str(self.team.pk), "joined_at": "2026-01-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Player self-patch authorisation test
#
# Confirms that a PLAYER cannot PATCH even the Player record linked to their
# own user account.  require_coach_or_admin fires before get_object(), so the
# ID match between user and player is irrelevant — the role check is decisive.
# ---------------------------------------------------------------------------

class PlayerSelfPatchAuthorizationTests(APITestCase):
    """A PLAYER cannot PATCH their own linked player record."""

    def setUp(self):
        self.p_user    = _make_user(User.Role.PLAYER, "player_sp@test.com")
        self.own_player = _make_player(user=self.p_user)
        self.url = reverse("player-detail", kwargs={"pk": self.own_player.pk})

    def test_player_cannot_patch_own_linked_record(self):
        """PLAYER role is rejected with 403 even when targeting their own record."""
        self.client.force_authenticate(self.p_user)
        response = self.client.patch(self.url, {"jersey_number": 99}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.own_player.refresh_from_db()
        self.assertIsNone(self.own_player.jersey_number)  # unchanged from initial None


# ---------------------------------------------------------------------------
# Membership PATCH authorisation tests
#
# Covers PATCH /api/players/{id}/academy-memberships/{id}/
#         and  /api/players/{id}/team-memberships/{id}/
#
# Access matrix
# ─────────────
# COACH / ACADEMY_ADMIN → 200  +  DB record is updated
# PLAYER / PARENT       → 403  +  DB record is unchanged
# unauthenticated       → 401  +  DB record is unchanged
# ---------------------------------------------------------------------------

class MembershipPatchAuthorizationTests(APITestCase):
    """Authorization tests for PATCH on academy and team membership endpoints."""

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
        from apps.teams.models import Team, PlayerTeamMembership

        self.coach   = _make_user(User.Role.COACH,         "coach_mp@test.com")
        self.admin   = _make_user(User.Role.ACADEMY_ADMIN, "admin_mp@test.com")
        self.p_user  = _make_user(User.Role.PLAYER,        "player_mp@test.com")
        self.parent  = _make_user(User.Role.PARENT,        "parent_mp@test.com")
        self.target  = _make_player()
        self.academy = Academy.objects.create(name="Patch Academy", city="London", country="England")
        self.team    = Team.objects.create(
            academy=self.academy, name="U15 Boys", age_group="U15", season="2025/26"
        )
        # Staff memberships so the "can" tests exercise the authorized workflow.
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        self.acad_membership = PlayerAcademyMembership.objects.create(
            player=self.target, academy=self.academy, joined_at="2025-01-01"
        )
        self.team_membership = PlayerTeamMembership.objects.create(
            player=self.target, team=self.team, joined_at="2025-01-01"
        )
        self.acad_patch_url = reverse(
            "player-academy-membership-detail",
            kwargs={"player_pk": self.target.pk, "pk": self.acad_membership.pk},
        )
        self.team_patch_url = reverse(
            "player-team-membership-detail",
            kwargs={"player_pk": self.target.pk, "pk": self.team_membership.pk},
        )

    # -- Academy membership PATCH --

    def test_coach_can_patch_academy_membership(self):
        self.client.force_authenticate(self.coach)
        response = self.client.patch(
            self.acad_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.acad_membership.refresh_from_db()
        self.assertEqual(self.acad_membership.status, "left")

    def test_admin_can_patch_academy_membership(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            self.acad_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.acad_membership.refresh_from_db()
        self.assertEqual(self.acad_membership.status, "left")

    def test_player_cannot_patch_academy_membership(self):
        self.client.force_authenticate(self.p_user)
        response = self.client.patch(
            self.acad_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.acad_membership.refresh_from_db()
        self.assertEqual(self.acad_membership.status, "active")
        self.assertIsNone(self.acad_membership.left_at)

    def test_parent_cannot_patch_academy_membership(self):
        self.client.force_authenticate(self.parent)
        response = self.client.patch(
            self.acad_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.acad_membership.refresh_from_db()
        self.assertEqual(self.acad_membership.status, "active")
        self.assertIsNone(self.acad_membership.left_at)

    def test_unauthenticated_cannot_patch_academy_membership(self):
        self.client.force_authenticate(user=None)
        response = self.client.patch(
            self.acad_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.acad_membership.refresh_from_db()
        self.assertEqual(self.acad_membership.status, "active")

    # -- Team membership PATCH --

    def test_coach_can_patch_team_membership(self):
        self.client.force_authenticate(self.coach)
        response = self.client.patch(
            self.team_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.team_membership.refresh_from_db()
        self.assertEqual(self.team_membership.status, "left")

    def test_admin_can_patch_team_membership(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            self.team_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.team_membership.refresh_from_db()
        self.assertEqual(self.team_membership.status, "left")

    def test_player_cannot_patch_team_membership(self):
        self.client.force_authenticate(self.p_user)
        response = self.client.patch(
            self.team_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.team_membership.refresh_from_db()
        self.assertEqual(self.team_membership.status, "active")
        self.assertIsNone(self.team_membership.left_at)

    def test_parent_cannot_patch_team_membership(self):
        self.client.force_authenticate(self.parent)
        response = self.client.patch(
            self.team_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.team_membership.refresh_from_db()
        self.assertEqual(self.team_membership.status, "active")
        self.assertIsNone(self.team_membership.left_at)

    def test_unauthenticated_cannot_patch_team_membership(self):
        self.client.force_authenticate(user=None)
        response = self.client.patch(
            self.team_patch_url, {"left_at": "2025-12-31", "status": "left"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.team_membership.refresh_from_db()
        self.assertEqual(self.team_membership.status, "active")


# ---------------------------------------------------------------------------
# Cross-academy object-level authorization tests (findings 1–4)
#
# A COACH or ACADEMY_ADMIN who holds staff membership in Academy X must NOT
# be able to create or modify memberships that belong to Academy Y.
# ---------------------------------------------------------------------------

class MembershipCrossAcademyAuthorizationTests(APITestCase):
    """
    Verify that academy-level object authorization is enforced on every
    membership write endpoint, not just the role check.
    """

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
        from apps.teams.models import Team, PlayerTeamMembership

        self.coach = _make_user(User.Role.COACH, "coach_cross@test.com")
        self.academy_x = Academy.objects.create(
            name="Academy X", city="London", country="England"
        )
        self.academy_y = Academy.objects.create(
            name="Academy Y", city="Leeds", country="England"
        )
        # Coach is staff of Academy X only — not Academy Y.
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_x)

        self.team_x = Team.objects.create(
            academy=self.academy_x, name="X Team", age_group="U15", season="2025/26"
        )
        self.team_y = Team.objects.create(
            academy=self.academy_y, name="Y Team", age_group="U15", season="2025/26"
        )
        self.player = _make_player()

        # Pre-existing memberships at Academy Y / Team Y.
        self.acad_y_membership = PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy_y, joined_at="2025-01-01"
        )
        self.team_y_membership = PlayerTeamMembership.objects.create(
            player=self.player, team=self.team_y, joined_at="2025-01-01"
        )
        self.client.force_authenticate(user=self.coach)

    # -- Finding 1: create academy membership --

    def test_coach_cannot_create_academy_membership_in_foreign_academy(self):
        """Coach of Academy X is denied when enrolling a player in Academy Y (403)."""
        # Use a fresh player with no existing memberships so the serializer's
        # duplicate-guard does not mask the 403 with a 400.
        fresh = _make_player()
        url = reverse("player-academy-membership-list", kwargs={"player_pk": fresh.pk})
        response = self.client.post(
            url, {"academy": str(self.academy_y.pk), "joined_at": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        from apps.academies.models import PlayerAcademyMembership
        self.assertEqual(PlayerAcademyMembership.objects.filter(player=fresh).count(), 0)

    def test_coach_can_create_academy_membership_in_own_academy(self):
        """Coach of Academy X can enroll a player in Academy X (201)."""
        url = reverse("player-academy-membership-list", kwargs={"player_pk": self.player.pk})
        response = self.client.post(
            url, {"academy": str(self.academy_x.pk), "joined_at": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # -- Finding 2: create team membership --

    def test_coach_cannot_create_team_membership_in_foreign_academy(self):
        """Coach of Academy X is denied when assigning a player to a team belonging to Academy Y (403)."""
        # Use a fresh player with no existing memberships so the serializer's
        # duplicate-guard does not mask the 403 with a 400.
        fresh = _make_player()
        url = reverse("player-team-membership-list", kwargs={"player_pk": fresh.pk})
        response = self.client.post(
            url, {"team": str(self.team_y.pk), "joined_at": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        from apps.teams.models import PlayerTeamMembership
        self.assertEqual(PlayerTeamMembership.objects.filter(player=fresh).count(), 0)

    def test_coach_can_create_team_membership_in_own_academy(self):
        """Coach of Academy X can assign a player to a team belonging to Academy X (201)."""
        url = reverse("player-team-membership-list", kwargs={"player_pk": self.player.pk})
        response = self.client.post(
            url, {"team": str(self.team_x.pk), "joined_at": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # -- Finding 3: patch academy membership --

    def test_coach_cannot_patch_academy_membership_in_foreign_academy(self):
        """Coach of Academy X is denied when closing a player's membership at Academy Y (403)."""
        url = reverse(
            "player-academy-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": self.acad_y_membership.pk},
        )
        response = self.client.patch(
            url, {"status": "left", "left_at": "2025-06-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.acad_y_membership.refresh_from_db()
        self.assertEqual(self.acad_y_membership.status, "active")
        self.assertIsNone(self.acad_y_membership.left_at)

    def test_coach_can_patch_academy_membership_in_own_academy(self):
        """Coach of Academy X can close a player's membership at Academy X (200)."""
        from apps.academies.models import PlayerAcademyMembership
        acad_x_membership = PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy_x, joined_at="2025-01-01"
        )
        url = reverse(
            "player-academy-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": acad_x_membership.pk},
        )
        response = self.client.patch(
            url, {"status": "left", "left_at": "2025-12-31"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        acad_x_membership.refresh_from_db()
        self.assertEqual(acad_x_membership.status, "left")

    # -- Finding 4: patch team membership --

    def test_coach_cannot_patch_team_membership_in_foreign_academy(self):
        """Coach of Academy X is denied when closing a player's membership in a team belonging to Academy Y (403)."""
        url = reverse(
            "player-team-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": self.team_y_membership.pk},
        )
        response = self.client.patch(
            url, {"status": "left", "left_at": "2025-06-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.team_y_membership.refresh_from_db()
        self.assertEqual(self.team_y_membership.status, "active")
        self.assertIsNone(self.team_y_membership.left_at)

    def test_coach_can_patch_team_membership_in_own_academy(self):
        """Coach of Academy X can close a player's membership in a team belonging to Academy X (200)."""
        from apps.teams.models import PlayerTeamMembership
        team_x_membership = PlayerTeamMembership.objects.create(
            player=self.player, team=self.team_x, joined_at="2025-01-01"
        )
        url = reverse(
            "player-team-membership-detail",
            kwargs={"player_pk": self.player.pk, "pk": team_x_membership.pk},
        )
        response = self.client.patch(
            url, {"status": "left", "left_at": "2025-12-31"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        team_x_membership.refresh_from_db()
        self.assertEqual(team_x_membership.status, "left")


# ---------------------------------------------------------------------------
# Finding 6: PlayerViewSet PATCH and DELETE academy-scope authorization
#
# PATCH: COACH/ACADEMY_ADMIN may edit a player only if they are staff of at
#        least one academy the player belongs to.  Players with no academy
#        memberships can be managed by any coach/admin (pass-through).
#
# DELETE: restricted to ACADEMY_ADMIN only; also requires staff affiliation.
#         A player with protected history (PlayerAcademyMembership etc.)
#         returns 409 instead of a raw 500.
# ---------------------------------------------------------------------------

class PlayerPatchAcademyScopeTests(APITestCase):
    """Object-level authorization on PATCH /api/players/{id}/."""

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership

        self.coach = _make_user(User.Role.COACH, "coach_f6p@test.com")
        self.academy_a = Academy.objects.create(name="Scope A", city="London", country="England")
        self.academy_b = Academy.objects.create(name="Scope B", city="Leeds", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)

        # Player enrolled only in Academy B.
        self.player_b = _make_player()
        PlayerAcademyMembership.objects.create(
            player=self.player_b, academy=self.academy_b, joined_at="2025-01-01"
        )
        # Player enrolled in Academy A.
        self.player_a = _make_player()
        PlayerAcademyMembership.objects.create(
            player=self.player_a, academy=self.academy_a, joined_at="2025-01-01"
        )
        # Player with no academy memberships.
        self.player_none = _make_player()

    def test_coach_can_patch_player_in_own_academy(self):
        """COACH with staff membership in Academy A can PATCH a player enrolled in Academy A."""
        self.client.force_authenticate(self.coach)
        url = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        response = self.client.patch(url, {"jersey_number": 7}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_coach_cannot_patch_player_in_foreign_academy(self):
        """COACH with staff membership in Academy A cannot PATCH a player enrolled only in Academy B.

        Under strict academy scoping the player is invisible (404) rather than
        forbidden (403) because get_queryset filters by staff membership.
        """
        self.client.force_authenticate(self.coach)
        url = reverse("player-detail", kwargs={"pk": self.player_b.pk})
        response = self.client.patch(url, {"jersey_number": 9}, format="json")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.player_b.refresh_from_db()
        self.assertIsNone(self.player_b.jersey_number)

    def test_coach_can_patch_player_enrolled_in_multiple_academies(self):
        """
        COACH with staff membership in Academy A can PATCH a player enrolled in
        both Academy A and Academy B.

        This verifies the ANY-match semantics: affiliation with one of the
        player's academies is sufficient.  If the implementation incorrectly
        required membership in ALL of the player's academies, this test would
        return 403 because the coach is not staff of Academy B.
        """
        from apps.academies.models import PlayerAcademyMembership

        # Enrol the same player in both Academy A and Academy B.
        multi_player = _make_player()
        PlayerAcademyMembership.objects.create(
            player=multi_player, academy=self.academy_a, joined_at="2025-01-01"
        )
        PlayerAcademyMembership.objects.create(
            player=multi_player, academy=self.academy_b, joined_at="2025-02-01"
        )

        # Coach is staff of Academy A only — not Academy B.
        self.client.force_authenticate(self.coach)
        url = reverse("player-detail", kwargs={"pk": multi_player.pk})
        response = self.client.patch(url, {"jersey_number": 5}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        multi_player.refresh_from_db()
        self.assertEqual(multi_player.jersey_number, 5)

    def test_coach_cannot_patch_player_with_no_academy_memberships(self):
        """COACH cannot PATCH a player with no academy enrollments — only superuser can.

        Under strict scoping, orphan players (no academy memberships) are
        invisible to non-superuser coaches because get_queryset filters by
        the user's academy memberships.
        """
        no_staff_coach = _make_user(User.Role.COACH, "coach_f6p_none@test.com")
        self.client.force_authenticate(no_staff_coach)
        url = reverse("player-detail", kwargs={"pk": self.player_none.pk})
        response = self.client.patch(url, {"jersey_number": 11}, format="json")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))


class PlayerDeleteAuthorizationTests(APITestCase):
    """
    Authorization tests for DELETE /api/players/{id}/.

    DELETE is restricted to ACADEMY_ADMIN only.
    A player with any protected FK (e.g. PlayerAcademyMembership) returns 409.
    """

    def setUp(self):
        from apps.academies.models import Academy, AcademyStaffMembership

        self.coach = _make_user(User.Role.COACH, "coach_f6d@test.com")
        self.admin = _make_user(User.Role.ACADEMY_ADMIN, "admin_f6d@test.com")
        self.academy = Academy.objects.create(name="Del Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)

    def test_admin_can_delete_player_with_no_history(self):
        """ACADEMY_ADMIN (superuser) can delete a player who has never been enrolled.

        Under strict scoping, orphan players are invisible to non-superuser
        staff.  Use a superuser admin to test the basic deletion path.
        """
        superadmin = User.objects.create_user(
            email="superadmin_f6d@test.com", password="testpass",
            first_name="Super", last_name="Admin",
            role=User.Role.ACADEMY_ADMIN, is_superuser=True,
        )
        player = _make_player()
        self.client.force_authenticate(superadmin)
        url = reverse("player-detail", kwargs={"pk": player.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Player.objects.filter(pk=player.pk).exists())

    def test_coach_cannot_delete_player(self):
        """COACH role is rejected before any object check — DELETE is ACADEMY_ADMIN only."""
        from apps.academies.models import AcademyStaffMembership, PlayerAcademyMembership

        player = _make_player()
        PlayerAcademyMembership.objects.create(player=player, academy=self.academy, joined_at="2026-01-01")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        self.client.force_authenticate(self.coach)
        url = reverse("player-detail", kwargs={"pk": player.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Player.objects.filter(pk=player.pk).exists())

    def test_admin_of_foreign_academy_cannot_delete_player(self):
        """ACADEMY_ADMIN with no affiliation to the player's academy is denied.

        Under strict scoping the player is invisible (404) rather than
        forbidden (403) because get_queryset filters by staff membership.
        """
        from apps.academies.models import Academy, PlayerAcademyMembership
        other_academy = Academy.objects.create(name="Other Academy", city="Bristol", country="England")
        player = _make_player()
        PlayerAcademyMembership.objects.create(
            player=player, academy=other_academy, joined_at="2025-01-01"
        )
        self.client.force_authenticate(self.admin)
        url = reverse("player-detail", kwargs={"pk": player.pk})
        response = self.client.delete(url)
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.assertTrue(Player.objects.filter(pk=player.pk).exists())

    def test_delete_player_with_academy_history_returns_409(self):
        """Deleting a player with a PlayerAcademyMembership returns 409, not 500."""
        from apps.academies.models import PlayerAcademyMembership
        player = _make_player()
        PlayerAcademyMembership.objects.create(
            player=player, academy=self.academy, joined_at="2025-01-01"
        )
        self.client.force_authenticate(self.admin)
        url = reverse("player-detail", kwargs={"pk": player.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("detail", response.data)
        self.assertTrue(Player.objects.filter(pk=player.pk).exists())
