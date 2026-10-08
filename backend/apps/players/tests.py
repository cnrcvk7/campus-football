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
        self.user = make_auth_user()
        self.client.force_authenticate(user=self.user)
        self.player = make_player()
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

    def test_delete_is_not_allowed(self):
        """DELETE /api/players/{id}/ must return 405 Method Not Allowed."""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        # Player must still exist
        self.assertTrue(Player.objects.filter(pk=self.player.pk).exists())

    # ---- Validation tests ----

    def test_create_rejects_future_date_of_birth(self):
        """A date of birth in the future must be rejected."""
        payload = {**VALID_DATA, "date_of_birth": "2099-01-01"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_of_birth", response.data)

    def test_create_rejects_invalid_jersey_number(self):
        """Jersey numbers outside 1–99 must be rejected."""
        payload = {**VALID_DATA, "jersey_number": 0}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_football_id_is_read_only_in_api(self):
        """Attempting to set football_id via the API must be ignored."""
        payload = {**VALID_DATA, "football_id": "CF-HACKED01"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(response.data["football_id"], "CF-HACKED01")


# ---------------------------------------------------------------------------
# Player history endpoint tests
# ---------------------------------------------------------------------------

class PlayerHistoryAPITests(APITestCase):

    def setUp(self):
        from apps.academies.models import Academy, PlayerAcademyMembership
        from apps.teams.models import Team, PlayerTeamMembership

        self.user = make_auth_user(email="history@example.com")
        self.client.force_authenticate(user=self.user)
        self.player = make_player()
        self.academy = Academy.objects.create(
            name="Test Academy", city="London", country="England"
        )
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
        """A player with no memberships gets empty history lists."""
        new_player = make_player(first_name="New", last_name="Player")
        url = reverse("player-history", kwargs={"pk": new_player.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["academy_history"], [])
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
        from apps.academies.models import Academy
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
