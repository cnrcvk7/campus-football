import uuid
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy
from apps.players.models import Player
from apps.teams.models import Team
from apps.users.models import User

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
        self.player = make_player()
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
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

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
