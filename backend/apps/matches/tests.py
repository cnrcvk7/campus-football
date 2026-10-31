import uuid
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.players.models import Player
from apps.teams.models import Team
from apps.users.models import ParentPlayerLink, User

from .models import Match, MatchPlayerStats


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def make_user(role, email, password="testpass123") -> User:
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="Test",
        last_name="User",
        role=role,
    )


def make_player(user=None, first_name="John", last_name="Doe") -> Player:
    player = Player.objects.create(
        first_name=first_name,
        last_name=last_name,
        date_of_birth="2005-06-15",
        gender="M",
    )
    if user is not None:
        player.user = user
        player.save()
    return player


def make_academy(name="Test Academy") -> Academy:
    return Academy.objects.create(name=name, city="London", country="England")


def make_staff_membership(user: User, academy: Academy) -> AcademyStaffMembership:
    return AcademyStaffMembership.objects.create(user=user, academy=academy)


def make_team(academy: Academy, name="U15 Boys") -> Team:
    return Team.objects.create(
        academy=academy,
        name=name,
        age_group="U15",
        season="2026/27",
    )


def make_match(
    coach: User,
    academy: Academy,
    team: Team,
    opponent_name="Spartak Academy",
    match_date="2026-10-14",
    home_away="HOME",
    team_score=None,
    opponent_score=None,
) -> Match:
    return Match.objects.create(
        academy=academy,
        team=team,
        opponent_name=opponent_name,
        match_date=match_date,
        home_away=home_away,
        team_score=team_score,
        opponent_score=opponent_score,
        created_by=coach,
    )


# ---------------------------------------------------------------------------
# 1–5. Match API tests
# ---------------------------------------------------------------------------


class MatchAPITests(APITestCase):
    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach@test.com")
        self.academy = make_academy()
        self.team = make_team(self.academy)
        make_staff_membership(self.coach, self.academy)
        self.client.force_authenticate(user=self.coach)
        self.list_url = reverse("match-list")

    def test_create_match(self):
        """POST /api/matches/ creates a match."""
        payload = {
            "academy": str(self.academy.pk),
            "team": str(self.team.pk),
            "opponent_name": "Spartak Academy",
            "match_date": "2026-10-14",
            "home_away": "HOME",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["opponent_name"], "Spartak Academy")
        self.assertEqual(response.data["home_away"], "HOME")
        self.assertIn("created_by", response.data)

    def test_retrieve_match(self):
        """GET /api/matches/{id}/ returns the match."""
        match = make_match(self.coach, self.academy, self.team)
        url = reverse("match-detail", args=[match.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(match.pk))
        self.assertIn("result", response.data)
        self.assertIn("score_display", response.data)

    def test_update_match(self):
        """PATCH /api/matches/{id}/ updates match fields."""
        match = make_match(self.coach, self.academy, self.team)
        url = reverse("match-detail", args=[match.pk])
        response = self.client.patch(
            url,
            {"team_score": 3, "opponent_score": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["team_score"], 3)
        self.assertEqual(response.data["result"], "WIN")
        self.assertEqual(response.data["score_display"], "3-1")

    def test_team_must_belong_to_academy(self):
        """Match creation fails when team belongs to a different academy."""
        other_academy = make_academy("Other Academy")
        other_team = make_team(other_academy, "Other U15")
        payload = {
            "academy": str(self.academy.pk),
            "team": str(other_team.pk),
            "opponent_name": "Rival FC",
            "match_date": "2026-10-14",
            "home_away": "AWAY",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("team", response.data)

    def test_home_away_validation(self):
        """Invalid home_away value returns 400."""
        payload = {
            "academy": str(self.academy.pk),
            "team": str(self.team.pk),
            "opponent_name": "Rival FC",
            "match_date": "2026-10-14",
            "home_away": "NEUTRAL",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_result_derived_from_scores(self):
        """result property returns WIN/DRAW/LOSS correctly."""
        win_match = make_match(
            self.coach, self.academy, self.team,
            team_score=2, opponent_score=0
        )
        draw_match = make_match(
            self.coach, self.academy, self.team,
            opponent_name="Draw FC", team_score=1, opponent_score=1
        )
        loss_match = make_match(
            self.coach, self.academy, self.team,
            opponent_name="Loss FC", team_score=0, opponent_score=3
        )
        self.assertEqual(win_match.result, "WIN")
        self.assertEqual(draw_match.result, "DRAW")
        self.assertEqual(loss_match.result, "LOSS")

    def test_result_none_when_scores_not_set(self):
        """result is None when scores have not been recorded."""
        match = make_match(self.coach, self.academy, self.team)
        self.assertIsNone(match.result)
        self.assertIsNone(match.score_display)


# ---------------------------------------------------------------------------
# 6–11. Match Player Stats tests
# ---------------------------------------------------------------------------


class MatchPlayerStatsTests(APITestCase):
    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach2@test.com")
        self.academy = make_academy("Stats Academy")
        self.team = make_team(self.academy)
        make_staff_membership(self.coach, self.academy)
        self.player = make_player()
        # Player must be affiliated with the match's academy (Task 3 security fix).
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2024-01-01"
        )
        self.match = make_match(self.coach, self.academy, self.team)
        self.client.force_authenticate(user=self.coach)
        self.list_url = reverse("match-player-stats-list", args=[self.match.pk])

    def test_create_player_stats(self):
        """POST /api/matches/{id}/players/ creates stats."""
        payload = {
            "player": str(self.player.pk),
            "started": True,
            "minutes_played": 90,
            "goals": 1,
            "assists": 2,
            "rating": "8.50",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["started"])
        self.assertEqual(response.data["goals"], 1)
        self.assertEqual(str(response.data["rating"]), "8.50")

    def test_update_stats(self):
        """PATCH /api/matches/{id}/players/{stats_id}/ updates stats."""
        stats = MatchPlayerStats.objects.create(
            match=self.match, player=self.player, started=True, minutes_played=90
        )
        url = reverse("match-player-stats-detail", args=[self.match.pk, stats.pk])
        response = self.client.patch(url, {"goals": 2, "rating": "9.00"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["goals"], 2)

    def test_duplicate_player_stats_rejected(self):
        """Second stats record for same player+match returns 400."""
        MatchPlayerStats.objects.create(
            match=self.match, player=self.player, started=False
        )
        payload = {"player": str(self.player.pk), "started": True}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player", response.data)

    def test_negative_goals_rejected(self):
        """Negative stat values are not accepted by the DB model constraint."""
        # PositiveSmallIntegerField rejects negative values at the DB level;
        # DRF serializer will catch invalid choices before that.
        # We test via model validation that goals cannot be set to -1.
        stats = MatchPlayerStats(
            match=self.match, player=self.player, goals=-1
        )
        from django.core.exceptions import ValidationError as DjangoValidationError
        with self.assertRaises((DjangoValidationError, Exception)):
            stats.full_clean()

    def test_rating_below_zero_rejected(self):
        """Rating < 0 is rejected at serializer level."""
        payload = {
            "player": str(self.player.pk),
            "rating": "-0.01",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rating_above_ten_rejected(self):
        """Rating > 10 is rejected at serializer level."""
        payload = {
            "player": str(self.player.pk),
            "rating": "10.01",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# 12–16. Permission tests
# ---------------------------------------------------------------------------


class MatchPermissionTests(APITestCase):
    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach3@test.com")
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "admin@test.com")
        self.player_user = make_user(User.Role.PLAYER, "player@test.com")
        self.player = make_player(user=self.player_user)
        self.other_player_user = make_user(User.Role.PLAYER, "other@test.com")
        self.other_player = make_player(user=self.other_player_user, first_name="Jane")
        self.academy = make_academy("Perm Academy")
        self.team = make_team(self.academy)
        make_staff_membership(self.coach, self.academy)
        make_staff_membership(self.admin, self.academy)
        self.match = make_match(self.coach, self.academy, self.team)
        self.list_url = reverse("match-list")

    def test_coach_can_create_match(self):
        """COACH role can create a match."""
        self.client.force_authenticate(user=self.coach)
        payload = {
            "academy": str(self.academy.pk),
            "team": str(self.team.pk),
            "opponent_name": "Rival FC",
            "match_date": "2026-11-01",
            "home_away": "HOME",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_academy_admin_can_manage_matches(self):
        """ACADEMY_ADMIN role can create and update matches."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "academy": str(self.academy.pk),
            "team": str(self.team.pk),
            "opponent_name": "Admin Test FC",
            "match_date": "2026-11-02",
            "home_away": "AWAY",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        url = reverse("match-detail", args=[response.data["id"]])
        patch_response = self.client.patch(url, {"team_score": 2}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)

    def test_player_can_view_own_match_history(self):
        """PLAYER role can view their own match history."""
        MatchPlayerStats.objects.create(match=self.match, player=self.player)
        self.client.force_authenticate(user=self.player_user)
        url = reverse("player-match-history", args=[self.player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_player_cannot_view_another_players_match_history(self):
        """PLAYER role cannot view another player's match history."""
        self.client.force_authenticate(user=self.player_user)
        url = reverse("player-match-history", args=[self.other_player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_cannot_access_matches(self):
        """Unauthenticated requests are rejected."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_player_role_cannot_create_match(self):
        """PLAYER role cannot create a match."""
        self.client.force_authenticate(user=self.player_user)
        payload = {
            "academy": str(self.academy.pk),
            "team": str(self.team.pk),
            "opponent_name": "Blocked FC",
            "match_date": "2026-11-01",
            "home_away": "HOME",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# 17–18. Player match history tests
# ---------------------------------------------------------------------------


class PlayerMatchHistoryTests(APITestCase):
    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach4@test.com")
        self.player_user = make_user(User.Role.PLAYER, "phist@test.com")
        self.player = make_player(user=self.player_user)
        self.academy = make_academy("History Academy")
        self.team = make_team(self.academy)
        make_staff_membership(self.coach, self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2026-01-01"
        )
        self.match = make_match(
            self.coach, self.academy, self.team,
            team_score=3, opponent_score=1
        )
        self.client.force_authenticate(user=self.coach)
        self.history_url = reverse("player-match-history", args=[self.player.pk])

    def test_player_match_history_returns_correct_matches(self):
        """History returns matches with stats."""
        MatchPlayerStats.objects.create(
            match=self.match,
            player=self.player,
            started=True,
            minutes_played=90,
            goals=1,
            assists=1,
        )
        response = self.client.get(self.history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        matches = response.data["matches"]
        self.assertEqual(len(matches), 1)

    def test_match_statistics_appear_correctly(self):
        """History entries contain expected stat fields."""
        MatchPlayerStats.objects.create(
            match=self.match,
            player=self.player,
            started=True,
            minutes_played=80,
            goals=1,
            assists=1,
            rating=Decimal("8.40"),
        )
        response = self.client.get(self.history_url)
        entry = response.data["matches"][0]
        self.assertEqual(entry["goals"], 1)
        self.assertEqual(entry["assists"], 1)
        self.assertTrue(entry["started"])
        self.assertEqual(entry["minutes_played"], 80)
        self.assertEqual(entry["opponent"], "Spartak Academy")
        self.assertEqual(entry["result"], "WIN")
        self.assertEqual(entry["score_display"], "3-1")

    def test_player_with_no_matches_returns_empty_list(self):
        """A player with no stats returns an empty matches list."""
        response = self.client.get(self.history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["matches"]), 0)


# ---------------------------------------------------------------------------
# 19–22. Player match summary tests
# ---------------------------------------------------------------------------


class PlayerMatchSummaryTests(APITestCase):
    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach5@test.com")
        self.player_user = make_user(User.Role.PLAYER, "psum@test.com")
        self.player = make_player(user=self.player_user)
        self.academy = make_academy("Summary Academy")
        self.team = make_team(self.academy)
        make_staff_membership(self.coach, self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2026-01-01"
        )
        self.match1 = make_match(self.coach, self.academy, self.team, match_date="2026-10-01")
        self.match2 = make_match(
            self.coach, self.academy, self.team,
            opponent_name="Second FC", match_date="2026-10-08"
        )
        self.client.force_authenticate(user=self.coach)
        self.summary_url = reverse("player-match-summary", args=[self.player.pk])

    def test_summary_matches_played_count(self):
        """matches_played equals the number of stats records."""
        MatchPlayerStats.objects.create(match=self.match1, player=self.player)
        MatchPlayerStats.objects.create(match=self.match2, player=self.player)
        response = self.client.get(self.summary_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["matches_played"], 2)

    def test_goals_and_assists_aggregated(self):
        """Goals and assists are summed across all matches."""
        MatchPlayerStats.objects.create(
            match=self.match1, player=self.player, goals=1, assists=2
        )
        MatchPlayerStats.objects.create(
            match=self.match2, player=self.player, goals=2, assists=1
        )
        response = self.client.get(self.summary_url)
        self.assertEqual(response.data["goals"], 3)
        self.assertEqual(response.data["assists"], 3)

    def test_average_rating_calculated(self):
        """average_rating is the mean of all rated matches."""
        MatchPlayerStats.objects.create(
            match=self.match1, player=self.player, rating=Decimal("8.00")
        )
        MatchPlayerStats.objects.create(
            match=self.match2, player=self.player, rating=Decimal("6.00")
        )
        response = self.client.get(self.summary_url)
        # Average of 8.00 and 6.00 = 7.00
        self.assertAlmostEqual(float(response.data["average_rating"]), 7.0, places=1)

    def test_minutes_aggregated(self):
        """total_minutes is summed across all matches."""
        MatchPlayerStats.objects.create(
            match=self.match1, player=self.player, minutes_played=90
        )
        MatchPlayerStats.objects.create(
            match=self.match2, player=self.player, minutes_played=45
        )
        response = self.client.get(self.summary_url)
        self.assertEqual(response.data["total_minutes"], 135)

    def test_summary_empty_for_player_with_no_matches(self):
        """Summary returns zeroes for a player with no match stats."""
        response = self.client.get(self.summary_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["matches_played"], 0)
        self.assertEqual(response.data["goals"], 0)
        self.assertIsNone(response.data["average_rating"])


# ---------------------------------------------------------------------------
# Academy-level authorization regression tests
# ---------------------------------------------------------------------------


class MatchAcademyAuthorizationTests(APITestCase):
    """
    Verify that academy-level staff membership is enforced throughout the
    matches domain: list, create, retrieve, update, nested player-stats, and
    player-history/summary views.
    """

    def setUp(self):
        # Academy A with a coach who is staff
        self.coach_a = make_user(User.Role.COACH, "coach_a@test.com")
        self.academy_a = make_academy("Academy A")
        self.team_a = make_team(self.academy_a, "A U15")
        make_staff_membership(self.coach_a, self.academy_a)
        self.match_a = make_match(self.coach_a, self.academy_a, self.team_a)

        # Academy B with its own coach who is staff
        self.coach_b = make_user(User.Role.COACH, "coach_b@test.com")
        self.academy_b = make_academy("Academy B")
        self.team_b = make_team(self.academy_b, "B U15")
        make_staff_membership(self.coach_b, self.academy_b)
        self.match_b = make_match(self.coach_b, self.academy_b, self.team_b)

        # A player linked to a user, with stats in Academy A
        self.player_user = make_user(User.Role.PLAYER, "player_auth@test.com")
        self.player = make_player(user=self.player_user)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy_a, joined_at="2026-01-01"
        )
        MatchPlayerStats.objects.create(match=self.match_a, player=self.player)

        self.list_url = reverse("match-list")

    # --- List isolation -------------------------------------------------------

    def test_coach_sees_only_own_academy_matches(self):
        """Coach only sees matches from academies they are staff of."""
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [m["id"] for m in response.data["results"]]
        self.assertIn(str(self.match_a.pk), ids)
        self.assertNotIn(str(self.match_b.pk), ids)

    # --- Create isolation -----------------------------------------------------

    def test_coach_without_membership_cannot_create(self):
        """Coach with no staff membership is denied match creation (403)."""
        coach_no_membership = make_user(User.Role.COACH, "nomember@test.com")
        self.client.force_authenticate(user=coach_no_membership)
        payload = {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "opponent_name": "Rival FC",
            "match_date": "2026-11-01",
            "home_away": "HOME",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_cannot_create_match_for_another_academy(self):
        """Coach A cannot create a match attributed to Academy B."""
        self.client.force_authenticate(user=self.coach_a)
        payload = {
            "academy": str(self.academy_b.pk),
            "team": str(self.team_b.pk),
            "opponent_name": "Rival FC",
            "match_date": "2026-11-01",
            "home_away": "HOME",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- Retrieve isolation ---------------------------------------------------

    def test_coach_cannot_retrieve_another_academys_match(self):
        """Coach A receives 404 when fetching a match from Academy B."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-detail", args=[self.match_b.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Update isolation -----------------------------------------------------

    def test_coach_cannot_update_another_academys_match(self):
        """Coach A receives 404 when PATCHing a match from Academy B."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-detail", args=[self.match_b.pk])
        response = self.client.patch(url, {"team_score": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_move_match_to_another_academy_via_patch(self):
        """Coach A cannot move their own match to Academy B via PATCH."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-detail", args=[self.match_a.pk])
        response = self.client.patch(
            url,
            {"academy": str(self.academy_b.pk), "team": str(self.team_b.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- Cross-academy team ---------------------------------------------------

    def test_cross_academy_team_rejected_on_create(self):
        """Supplying a team that belongs to a different academy returns 400."""
        self.client.force_authenticate(user=self.coach_a)
        payload = {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_b.pk),  # team_b belongs to academy_b
            "opponent_name": "Rival FC",
            "match_date": "2026-11-01",
            "home_away": "HOME",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- Nested player-stats isolation ----------------------------------------

    def test_coach_cannot_list_stats_for_another_academys_match(self):
        """Coach A receives 404 when listing stats for Academy B's match."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-player-stats-list", args=[self.match_b.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_cannot_add_stats_to_another_academys_match(self):
        """Coach A receives 404 when adding stats to Academy B's match."""
        player = make_player()
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-player-stats-list", args=[self.match_b.pk])
        response = self.client.post(url, {"player": str(player.pk), "started": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Player history and summary scoping -----------------------------------

    def test_player_role_sees_full_own_match_history(self):
        """PLAYER role receives their full match history regardless of academy scoping."""
        self.client.force_authenticate(user=self.player_user)
        url = reverse("player-match-history", args=[self.player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["matches"]), 1)

    def test_coach_sees_only_own_academy_in_player_history(self):
        """COACH sees only history from their own academies when viewing a player."""
        # Add a second stats record for the same player in Academy B
        MatchPlayerStats.objects.create(match=self.match_b, player=self.player)

        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-match-history", args=[self.player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Coach A must see only the Academy A match
        self.assertEqual(len(response.data["matches"]), 1)
        self.assertEqual(str(response.data["matches"][0]["match"]), str(self.match_a.pk))

    def test_coach_sees_only_own_academy_in_player_summary(self):
        """COACH sees only stats from their own academies in the player summary."""
        # stats in Academy A: 2 goals
        stats_a = MatchPlayerStats.objects.get(match=self.match_a, player=self.player)
        stats_a.goals = 2
        stats_a.save()
        # stats in Academy B: 5 goals — coach_a must not see these
        MatchPlayerStats.objects.create(match=self.match_b, player=self.player, goals=5)

        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-match-summary", args=[self.player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["matches_played"], 1)
        self.assertEqual(response.data["goals"], 2)

    # --- Cross-academy team on update (no academy change) --------------------

    def test_patch_with_cross_academy_team_returns_400(self):
        """PATCH with a team from another academy (no academy change) returns 400 and leaves the match unchanged."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-detail", args=[self.match_a.pk])
        response = self.client.patch(
            url,
            {"team": str(self.team_b.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("team", response.data)
        # Verify the match is unchanged in the DB
        self.match_a.refresh_from_db()
        self.assertEqual(self.match_a.team_id, self.team_a.pk)

    # --- Nested stats retrieve / update cross-academy ------------------------

    def test_coach_cannot_retrieve_stats_for_another_academys_match(self):
        """Coach A receives 404 when retrieving a stats record from Academy B's match."""
        stats = MatchPlayerStats.objects.create(match=self.match_b, player=self.player)
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-player-stats-detail", args=[self.match_b.pk, stats.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_cannot_update_stats_for_another_academys_match(self):
        """Coach A receives 404 when updating a stats record in Academy B's match and the record is unchanged."""
        stats = MatchPlayerStats.objects.create(match=self.match_b, player=self.player, goals=3)
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-player-stats-detail", args=[self.match_b.pk, stats.pk])
        response = self.client.patch(url, {"goals": 99}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        # Verify the record was not modified
        stats.refresh_from_db()
        self.assertEqual(stats.goals, 3)


# ---------------------------------------------------------------------------
# Parent access tests
# ---------------------------------------------------------------------------


class ParentMatchAccessTests(APITestCase):
    """
    Verify that PARENT users can read history/summary for explicitly linked
    players and are denied access for non-linked players.
    """

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach_parent@test.com")
        self.academy = make_academy("Parent Academy")
        self.team = make_team(self.academy)
        make_staff_membership(self.coach, self.academy)

        # Player linked to a parent
        self.parent_user = make_user(User.Role.PARENT, "parent@test.com")
        self.linked_player_user = make_user(User.Role.PLAYER, "linked_player@test.com")
        self.linked_player = make_player(user=self.linked_player_user, first_name="Linked")
        ParentPlayerLink.objects.create(parent=self.parent_user, player=self.linked_player)

        # A second player with NO link to the parent
        self.unlinked_player = make_player(first_name="Unlinked")

        self.match = make_match(self.coach, self.academy, self.team, team_score=2, opponent_score=1)
        MatchPlayerStats.objects.create(
            match=self.match, player=self.linked_player, started=True, minutes_played=90, goals=1
        )

    def test_parent_can_read_linked_player_match_history(self):
        """PARENT can read the match history of an explicitly linked player."""
        self.client.force_authenticate(user=self.parent_user)
        url = reverse("player-match-history", args=[self.linked_player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["matches"]), 1)
        self.assertEqual(response.data["matches"][0]["goals"], 1)

    def test_parent_can_read_linked_player_match_summary(self):
        """PARENT can read the match summary of an explicitly linked player."""
        self.client.force_authenticate(user=self.parent_user)
        url = reverse("player-match-summary", args=[self.linked_player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["matches_played"], 1)
        self.assertEqual(response.data["goals"], 1)

    def test_parent_cannot_read_unlinked_player_match_history(self):
        """PARENT receives 404 when reading history for a player they are not linked to."""
        self.client.force_authenticate(user=self.parent_user)
        url = reverse("player-match-history", args=[self.unlinked_player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_parent_cannot_read_unlinked_player_match_summary(self):
        """PARENT receives 404 when reading summary for a player they are not linked to."""
        self.client.force_authenticate(user=self.parent_user)
        url = reverse("player-match-summary", args=[self.unlinked_player.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# ACADEMY_ADMIN isolation tests
# ---------------------------------------------------------------------------


class AcademyAdminMatchIsolationTests(APITestCase):
    """
    Verify that ACADEMY_ADMIN users are scoped to their own academies in the
    same way as COACH users.
    """

    def setUp(self):
        # Admin of Academy A
        self.admin_a = make_user(User.Role.ACADEMY_ADMIN, "admin_a@test.com")
        self.academy_a = make_academy("Admin Academy A")
        self.team_a = make_team(self.academy_a, "Admin A U15")
        make_staff_membership(self.admin_a, self.academy_a)
        self.match_a = make_match(self.admin_a, self.academy_a, self.team_a)

        # Separate Academy B, admin_a has NO membership there
        self.academy_b = make_academy("Admin Academy B")
        self.team_b = make_team(self.academy_b, "Admin B U15")
        coach_b = make_user(User.Role.COACH, "admin_b_creator@test.com")
        make_staff_membership(coach_b, self.academy_b)
        self.match_b = make_match(coach_b, self.academy_b, self.team_b)

        self.list_url = reverse("match-list")

    def test_academy_admin_cannot_list_another_academys_matches(self):
        """ACADEMY_ADMIN sees only matches from academies they are staff of."""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [m["id"] for m in response.data["results"]]
        self.assertIn(str(self.match_a.pk), ids)
        self.assertNotIn(str(self.match_b.pk), ids)

    def test_academy_admin_cannot_retrieve_another_academys_match(self):
        """ACADEMY_ADMIN receives 404 when fetching a match from Academy B."""
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("match-detail", args=[self.match_b.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_academy_admin_cannot_create_match_for_another_academy(self):
        """ACADEMY_ADMIN cannot create a match for an academy they are not staff of."""
        self.client.force_authenticate(user=self.admin_a)
        payload = {
            "academy": str(self.academy_b.pk),
            "team": str(self.team_b.pk),
            "opponent_name": "Rival FC",
            "match_date": "2026-11-10",
            "home_away": "HOME",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# MatchPlayerStats duplicate-on-update tests
# ---------------------------------------------------------------------------


class MatchPlayerStatsDuplicateUpdateTests(APITestCase):
    """
    Verify that reassigning a stats record's player to one that already has
    stats for the same match returns HTTP 400, not an unhandled 500.
    """

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach_dup@test.com")
        self.academy = make_academy("Dup Academy")
        self.team = make_team(self.academy)
        make_staff_membership(self.coach, self.academy)
        self.match = make_match(self.coach, self.academy, self.team)
        self.player1 = make_player(first_name="Player1")
        self.player2 = make_player(first_name="Player2")
        self.stats1 = MatchPlayerStats.objects.create(
            match=self.match, player=self.player1, goals=2
        )
        self.stats2 = MatchPlayerStats.objects.create(
            match=self.match, player=self.player2, goals=1
        )
        self.client.force_authenticate(user=self.coach)

    def test_patch_player_to_existing_player_returns_400(self):
        """PATCH stats record to reassign player to one already recorded returns 400."""
        url = reverse("match-player-stats-detail", args=[self.match.pk, self.stats1.pk])
        response = self.client.patch(url, {"player": str(self.player2.pk)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player", response.data)
        # Verify neither record was changed
        self.stats1.refresh_from_db()
        self.assertEqual(self.stats1.player_id, self.player1.pk)

    def test_patch_other_fields_on_stats_without_changing_player_succeeds(self):
        """PATCH of non-player fields on a stats record succeeds without false duplicate errors."""
        url = reverse("match-player-stats-detail", args=[self.match.pk, self.stats1.pk])
        response = self.client.patch(url, {"goals": 5}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.stats1.refresh_from_db()
        self.assertEqual(self.stats1.goals, 5)

    def test_patch_same_player_on_own_stats_succeeds(self):
        """PATCH that resends the same player (no actual change) does not raise a duplicate error."""
        url = reverse("match-player-stats-detail", args=[self.match.pk, self.stats1.pk])
        response = self.client.patch(url, {"player": str(self.player1.pk), "goals": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.stats1.refresh_from_db()
        self.assertEqual(self.stats1.goals, 3)


# ---------------------------------------------------------------------------
# Match player-affiliation regression tests (Task 3)
# ---------------------------------------------------------------------------


class MatchPlayerAffiliationTests(APITestCase):
    """
    Verify that player stats can only be created for players who are
    legitimately associated with the match's academy — either via a direct
    PlayerAcademyMembership or via a PlayerTeamMembership at a team belonging
    to that academy.  PATCH on an existing record is not rechecked.
    """

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "aff_mcoach@test.com")
        self.academy = make_academy("Match Affiliation Academy")
        self.other_academy = make_academy("Other Match Academy")
        self.team = make_team(self.academy, "U15 Match")
        make_staff_membership(self.coach, self.academy)
        self.match = make_match(self.coach, self.academy, self.team)
        self.client.force_authenticate(user=self.coach)
        self.list_url = reverse("match-player-stats-list", args=[self.match.pk])

    def _post_stats(self, player):
        return self.client.post(
            self.list_url, {"player": str(player.pk), "started": True}, format="json"
        )

    def test_player_with_no_affiliation_is_rejected(self):
        """Player with no academy or team membership cannot be added to match stats (400)."""
        unrelated = make_player(first_name="NoAff")
        response = self._post_stats(unrelated)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player", response.data)

    def test_player_with_academy_membership_is_accepted(self):
        """Player with a direct academy membership for the match's academy is accepted (201)."""
        player = make_player(first_name="DirectAcad")
        PlayerAcademyMembership.objects.create(
            player=player, academy=self.academy, joined_at="2024-01-01"
        )
        response = self._post_stats(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_player_with_team_membership_in_match_academy_is_accepted(self):
        """Player with a team membership in the match's academy is accepted (201)."""
        from apps.teams.models import PlayerTeamMembership
        player = make_player(first_name="TeamMem")
        PlayerTeamMembership.objects.create(
            player=player, team=self.team, joined_at="2024-01-01"
        )
        response = self._post_stats(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_player_with_team_membership_in_different_academy_is_rejected(self):
        """Player affiliated only with a different academy's team is rejected (400)."""
        from apps.teams.models import PlayerTeamMembership
        other_team = make_team(self.other_academy, "Other U15")
        player = make_player(first_name="WrongAcad")
        PlayerTeamMembership.objects.create(
            player=player, team=other_team, joined_at="2024-01-01"
        )
        response = self._post_stats(player)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player", response.data)

    def test_historical_academy_membership_counts_as_affiliation(self):
        """A player with a LEFT academy membership is still accepted (alumni scenario)."""
        from apps.academies.models import PlayerAcademyMembership
        player = make_player(first_name="MatchAlumni")
        PlayerAcademyMembership.objects.create(
            player=player,
            academy=self.academy,
            joined_at="2022-09-01",
            left_at="2023-06-30",
            status=PlayerAcademyMembership.Status.LEFT,
        )
        response = self._post_stats(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_multi_academy_player_accepted_via_correct_academy(self):
        """Multi-academy player is accepted when one of their memberships matches the match's academy."""
        player = make_player(first_name="MultiAcad")
        PlayerAcademyMembership.objects.create(
            player=player, academy=self.other_academy, joined_at="2023-01-01"
        )
        PlayerAcademyMembership.objects.create(
            player=player, academy=self.academy, joined_at="2024-01-01"
        )
        response = self._post_stats(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_patch_existing_stats_does_not_recheck_affiliation(self):
        """PATCH on an existing stats record is not blocked by the affiliation check."""
        unrelated = make_player(first_name="PatchOnly")
        stats = MatchPlayerStats.objects.create(
            match=self.match, player=unrelated, started=False
        )
        url = reverse("match-player-stats-detail", args=[self.match.pk, stats.pk])
        response = self.client.patch(url, {"goals": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
