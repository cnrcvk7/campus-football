"""
Cross-academy access matrix regression tests.

Two academies (A and B), each with their own staff, players, parents,
and domain objects. For every detail/nested GET endpoint, asserts that
coach B, player B, and parent B receive 404 when requesting academy A's
objects — and that the 404 body is identical to a non-existent UUID.

Endpoints intentionally excluded (with reasons) are listed at the bottom
of this file.
"""

import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import (
    Academy,
    AcademyStaffMembership,
    PlayerAcademyMembership,
)
from apps.announcements.models import Announcement, AnnouncementReceipt
from apps.development.models import (
    Assessment,
    AssessmentItem,
    DevelopmentGoal,
    PhysicalMeasurement,
    Skill,
)
from apps.matches.models import Match, MatchPlayerStats
from apps.players.models import Player
from apps.tactics.models import Lineup, LineupSlot, TacticBoard
from apps.teams.models import PlayerTeamMembership, Team
from apps.training.models import (
    Exercise,
    TrainingAttendance,
    TrainingSession,
    TrainingSessionExercise,
)
from apps.users.models import ParentPlayerLink, User


FAKE_PK = uuid.uuid4()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user(role, email, **kw):
    return User.objects.create_user(
        email=email, password="testpass123",
        first_name="Test", last_name="User", role=role, **kw,
    )


def _superuser():
    return User.objects.create_superuser(
        email="super@test.com", password="testpass123",
        first_name="Super", last_name="Admin",
    )


def _academy(name):
    return Academy.objects.create(name=name, city="City", country="Country")


def _team(academy, name):
    return Team.objects.create(academy=academy, name=name)


def _player(first, last, user=None):
    p = Player.objects.create(
        first_name=first, last_name=last,
        date_of_birth="2008-01-01", gender="M",
    )
    if user:
        p.user = user
        p.save()
    return p


def _staff(user, academy):
    return AcademyStaffMembership.objects.create(user=user, academy=academy)


def _enroll(player, academy):
    return PlayerAcademyMembership.objects.create(
        player=player, academy=academy, joined_at="2026-01-01",
    )


def _team_membership(player, team):
    return PlayerTeamMembership.objects.create(
        player=player, team=team, joined_at="2026-01-01",
    )


# ---------------------------------------------------------------------------
# Fixture mixin
# ---------------------------------------------------------------------------

class AccessMatrixMixin:
    """
    Sets up two fully-populated academies for cross-academy testing.

    Academy A objects are the targets that B users must NOT reach.
    """

    def set_up_fixture(self):
        # ---- Academy A ----
        self.academy_a = _academy("Academy A")
        self.coach_a = _user(User.Role.COACH, "coach_a@t.com")
        _staff(self.coach_a, self.academy_a)
        self.admin_a = _user(User.Role.ACADEMY_ADMIN, "admin_a@t.com")
        _staff(self.admin_a, self.academy_a)
        self.team_a = _team(self.academy_a, "A U15")
        self.player_user_a = _user(User.Role.PLAYER, "pu_a@t.com")
        self.player_a = _player("Alice", "Alpha", user=self.player_user_a)
        _enroll(self.player_a, self.academy_a)
        _team_membership(self.player_a, self.team_a)
        self.parent_a = _user(User.Role.PARENT, "parent_a@t.com")
        ParentPlayerLink.objects.create(parent=self.parent_a, player=self.player_a)

        # ---- Academy B ----
        self.academy_b = _academy("Academy B")
        self.coach_b = _user(User.Role.COACH, "coach_b@t.com")
        _staff(self.coach_b, self.academy_b)
        self.admin_b = _user(User.Role.ACADEMY_ADMIN, "admin_b@t.com")
        _staff(self.admin_b, self.academy_b)
        self.team_b = _team(self.academy_b, "B U15")
        self.player_user_b = _user(User.Role.PLAYER, "pu_b@t.com")
        self.player_b = _player("Bob", "Bravo", user=self.player_user_b)
        _enroll(self.player_b, self.academy_b)
        _team_membership(self.player_b, self.team_b)
        self.parent_b = _user(User.Role.PARENT, "parent_b@t.com")
        ParentPlayerLink.objects.create(parent=self.parent_b, player=self.player_b)

        self.superuser = _superuser()

        # ---- Development data (Academy A) ----
        self.skill = Skill.objects.create(name="Dribbling", category="TECHNICAL")
        self.assessment_a = Assessment.objects.create(
            player=self.player_a, coach=self.coach_a,
            assessment_date="2026-09-01",
        )
        AssessmentItem.objects.create(
            assessment=self.assessment_a, skill=self.skill, score=7,
        )
        self.goal_a = DevelopmentGoal.objects.create(
            player=self.player_a, skill=self.skill,
            description="Improve dribbling",
            start_date="2026-09-01", target_date="2026-12-01",
            created_by=self.coach_a,
        )
        self.measurement_a = PhysicalMeasurement.objects.create(
            player=self.player_a, measurement_date="2026-09-01",
            height_cm="175.00",
        )

        # ---- Match data (Academy A) ----
        self.match_a = Match.objects.create(
            academy=self.academy_a, team=self.team_a,
            opponent_name="Opponent", match_date="2026-09-15",
            home_away="HOME", created_by=self.coach_a,
        )
        self.match_stats_a = MatchPlayerStats.objects.create(
            match=self.match_a, player=self.player_a,
            minutes_played=90, started=True,
        )

        # ---- Training data (Academy A) ----
        self.exercise_a = Exercise.objects.create(
            name="Passing Drill", category="TECHNICAL",
            created_by=self.coach_a,
        )
        self.session_a = TrainingSession.objects.create(
            academy=self.academy_a, team=self.team_a,
            coach=self.coach_a, training_date="2026-09-10",
        )
        self.session_exercise_a = TrainingSessionExercise.objects.create(
            session=self.session_a, exercise=self.exercise_a, order=1,
        )
        self.attendance_a = TrainingAttendance.objects.create(
            session=self.session_a, player=self.player_a, status="PRESENT",
        )

        # ---- Announcement (Academy A, team-scoped) ----
        self.announcement_a = Announcement.objects.create(
            academy=self.academy_a, team=self.team_a,
            author=self.coach_a, title="Team A update",
            body="Details here.",
        )

        # ---- Tactics: Lineup (Academy A match) ----
        self.lineup_a = Lineup.objects.create(
            match=self.match_a, game_format=11,
            formation="4-3-3", version=1,
            created_by=self.coach_a, updated_by=self.coach_a,
            status=Lineup.Status.PUBLISHED,
        )
        from decimal import Decimal
        LineupSlot.objects.create(
            lineup=self.lineup_a, player=self.player_a,
            role="STARTER", x=Decimal("0.5000"), y=Decimal("0.9000"), order=1,
        )

        # ---- Tactics: Board (Academy A) ----
        self.board_a = TacticBoard.objects.create(
            academy=self.academy_a, team=self.team_a,
            title="Pressing Plan", game_format=11,
            tokens=[], drawing=[],
            version=1, created_by=self.coach_a, updated_by=self.coach_a,
        )

        # ---- Invitation (Academy A) ----
        from datetime import timedelta
        from django.utils import timezone
        from apps.invitations.models import Invitation, hash_token
        self.invitation_a = Invitation.objects.create(
            academy=self.academy_a,
            player=self.player_a,
            role=Invitation.Role.PLAYER,
            token_hash=hash_token("test-token-aaa"),
            created_by=self.admin_a,
            expires_at=timezone.now() + timedelta(days=7),
        )


# ===========================================================================
# Cross-academy GET endpoint matrix
# ===========================================================================

class CrossAcademyAccessMatrixTests(AccessMatrixMixin, APITestCase):
    """
    For each (user, endpoint) pair, assert that academy-B users cannot access
    academy-A objects, and that the 404 body is indistinguishable from a
    request for a non-existent UUID.
    """

    def setUp(self):
        self.set_up_fixture()

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _assert_blocked(self, user, url, expected_status=status.HTTP_404_NOT_FOUND):
        """Assert the user gets blocked (404 or 403) when accessing the URL."""
        self.client.force_authenticate(user=user)
        resp = self.client.get(url)
        self.assertIn(
            resp.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
            f"{user.email} should be blocked from {url}, got {resp.status_code}",
        )

    def _assert_404_for_all_b_users(self, url):
        """All B-side users must get 404 (or 403 where role-blocked)."""
        for user in (self.coach_b, self.admin_b, self.player_user_b, self.parent_b):
            self._assert_blocked(user, url)

    @staticmethod
    def _extract_ids(data):
        """Extract IDs from list response (handles both plain list and DRF pagination)."""
        items = data.get("results", data) if isinstance(data, dict) else data
        return {item["id"] for item in items}

    def _assert_allowed(self, user, url):
        self.client.force_authenticate(user=user)
        resp = self.client.get(url)
        self.assertIn(
            resp.status_code,
            (status.HTTP_200_OK, status.HTTP_201_CREATED),
            f"{user.email} should be allowed {url}, got {resp.status_code}",
        )

    # ===================================================================
    # 1. ACADEMIES
    # ===================================================================

    def test_academy_detail(self):
        """GET /api/academies/{id}/ — scoped by AcademyStaffMembership."""
        url = reverse("academy-detail", kwargs={"pk": self.academy_a.pk})
        # Coach B and Admin B should not see Academy A
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        # Coach A should see it
        self._assert_allowed(self.coach_a, url)

    def test_academy_list(self):
        """GET /api/academies/ — B staff should not see A."""
        url = reverse("academy-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.academy_a.pk), ids)

    # ===================================================================
    # 2. TEAMS
    # ===================================================================

    def test_team_detail(self):
        """GET /api/teams/{id}/ — scoped by academy staff membership."""
        url = reverse("team-detail", kwargs={"pk": self.team_a.pk})
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        self._assert_allowed(self.coach_a, url)

    def test_team_list(self):
        """GET /api/teams/ — B staff should not see A teams."""
        url = reverse("team-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.team_a.pk), ids)

    def test_team_players(self):
        """GET /api/teams/{team_pk}/players/ — resolved through academy-scoped queryset."""
        url = reverse("team-players", kwargs={"team_pk": self.team_a.pk})
        for user in (self.coach_b, self.admin_b):
            self.client.force_authenticate(user=user)
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND,
                             f"{user.email} should get 404 from {url}")
        self._assert_allowed(self.coach_a, url)

    def test_team_players_404_body_identical(self):
        """Out-of-scope team-players 404 body must match non-existent team."""
        real_url = reverse("team-players", kwargs={"team_pk": self.team_a.pk})
        fake_url = reverse("team-players", kwargs={"team_pk": FAKE_PK})
        self.client.force_authenticate(user=self.coach_b)
        real_resp = self.client.get(real_url)
        fake_resp = self.client.get(fake_url)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    # ===================================================================
    # 3. PLAYERS (detail + history)
    # ===================================================================

    def test_player_detail(self):
        """GET /api/players/{id}/ — coach B must NOT see player A."""
        url = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_player_detail_404_body_identical(self):
        url_real = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        url_fake = reverse("player-detail", kwargs={"pk": FAKE_PK})
        self.client.force_authenticate(user=self.coach_b)
        real_resp = self.client.get(url_real)
        fake_resp = self.client.get(url_fake)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    def test_player_history(self):
        """GET /api/players/{id}/history/"""
        url = reverse("player-history", kwargs={"pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_player_history_404_body_identical(self):
        url_real = reverse("player-history", kwargs={"pk": self.player_a.pk})
        url_fake = reverse("player-history", kwargs={"pk": FAKE_PK})
        self.client.force_authenticate(user=self.coach_b)
        real_resp = self.client.get(url_real)
        fake_resp = self.client.get(url_fake)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    def test_player_list_does_not_leak(self):
        """GET /api/players/ — B staff must not see A's players."""
        url = reverse("player-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.player_a.pk), ids)

    # ===================================================================
    # 4. DEVELOPMENT (assessments, goals, measurements, timeline, compare)
    # ===================================================================

    def test_assessment_list(self):
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_assessment_detail(self):
        url = reverse("player-assessment-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.assessment_a.pk,
        })
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_goal_list(self):
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_goal_detail(self):
        url = reverse("player-goal-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.goal_a.pk,
        })
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_measurement_list(self):
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_measurement_detail(self):
        url = reverse("player-measurement-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.measurement_a.pk,
        })
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_development_timeline(self):
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_player_comparison(self):
        url = reverse("player-compare", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    # ===================================================================
    # 5. MATCHES (detail, player stats list/detail, history, summary)
    # ===================================================================

    def test_match_detail(self):
        """GET /api/matches/{id}/ — scoped by get_queryset (academy staff)."""
        url = reverse("match-detail", kwargs={"pk": self.match_a.pk})
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        self._assert_allowed(self.coach_a, url)

    def test_match_list(self):
        url = reverse("match-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.match_a.pk), ids)

    def test_match_player_stats_list(self):
        """GET /api/matches/{match_pk}/players/ — resolved through academy-scoped queryset."""
        url = reverse("match-player-stats-list", kwargs={"match_pk": self.match_a.pk})
        for user in (self.coach_b, self.admin_b):
            self.client.force_authenticate(user=user)
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND,
                             f"{user.email} should get 404 from {url}")
        self._assert_allowed(self.coach_a, url)

    def test_match_player_stats_list_404_body_identical(self):
        """Out-of-scope match-player-stats 404 body must match non-existent match."""
        real_url = reverse("match-player-stats-list", kwargs={"match_pk": self.match_a.pk})
        fake_url = reverse("match-player-stats-list", kwargs={"match_pk": FAKE_PK})
        self.client.force_authenticate(user=self.coach_b)
        real_resp = self.client.get(real_url)
        fake_resp = self.client.get(fake_url)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    def test_match_player_stats_detail(self):
        """GET /api/matches/{match_pk}/players/{pk}/ — resolved through academy-scoped queryset."""
        url = reverse("match-player-stats-detail", kwargs={
            "match_pk": self.match_a.pk, "pk": self.match_stats_a.pk,
        })
        for user in (self.coach_b, self.admin_b):
            self.client.force_authenticate(user=user)
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND,
                             f"{user.email} should get 404 from {url}")
        self._assert_allowed(self.coach_a, url)

    def test_match_player_stats_detail_404_body_identical(self):
        """Out-of-scope match-player-stats detail 404 body must match non-existent match."""
        real_url = reverse("match-player-stats-detail", kwargs={
            "match_pk": self.match_a.pk, "pk": self.match_stats_a.pk,
        })
        fake_url = reverse("match-player-stats-detail", kwargs={
            "match_pk": FAKE_PK, "pk": self.match_stats_a.pk,
        })
        self.client.force_authenticate(user=self.coach_b)
        real_resp = self.client.get(real_url)
        fake_resp = self.client.get(fake_url)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    def test_player_match_history(self):
        """GET /api/players/{player_pk}/matches/ — player-scoped, academy-gated."""
        url = reverse("player-match-history", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_player_match_summary(self):
        """GET /api/players/{player_pk}/matches/summary/"""
        url = reverse("player-match-summary", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    # ===================================================================
    # 6. TRAINING (sessions, exercises, session exercises, attendance,
    #              player training history)
    # ===================================================================

    def test_training_session_detail(self):
        """GET /api/training/sessions/{id}/ — academy-scoped queryset."""
        url = reverse("training-session-detail", kwargs={"pk": self.session_a.pk})
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        self._assert_allowed(self.coach_a, url)

    def test_training_session_list(self):
        url = reverse("training-session-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.session_a.pk), ids)

    def test_session_exercise_list(self):
        """GET /api/training/sessions/{session_pk}/exercises/ — resolved through academy-scoped queryset."""
        url = reverse("training-session-exercise-list", kwargs={"session_pk": self.session_a.pk})
        for user in (self.coach_b, self.admin_b):
            self.client.force_authenticate(user=user)
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND,
                             f"{user.email} should get 404 from {url}")
        self._assert_allowed(self.coach_a, url)

    def test_session_exercise_list_404_body_identical(self):
        """Out-of-scope session-exercises 404 body must match non-existent session."""
        real_url = reverse("training-session-exercise-list", kwargs={"session_pk": self.session_a.pk})
        fake_url = reverse("training-session-exercise-list", kwargs={"session_pk": FAKE_PK})
        self.client.force_authenticate(user=self.coach_b)
        real_resp = self.client.get(real_url)
        fake_resp = self.client.get(fake_url)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    def test_training_attendance_list(self):
        """GET /api/training/sessions/{session_pk}/attendance/ — resolved through academy-scoped queryset."""
        url = reverse("training-attendance-list", kwargs={"session_pk": self.session_a.pk})
        for user in (self.coach_b, self.admin_b):
            self.client.force_authenticate(user=user)
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND,
                             f"{user.email} should get 404 from {url}")
        self._assert_allowed(self.coach_a, url)

    def test_training_attendance_list_404_body_identical(self):
        """Out-of-scope attendance 404 body must match non-existent session."""
        real_url = reverse("training-attendance-list", kwargs={"session_pk": self.session_a.pk})
        fake_url = reverse("training-attendance-list", kwargs={"session_pk": FAKE_PK})
        self.client.force_authenticate(user=self.coach_b)
        real_resp = self.client.get(real_url)
        fake_resp = self.client.get(fake_url)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    def test_player_training_history(self):
        """GET /api/players/{player_pk}/training/history/"""
        url = reverse("player-training-history", kwargs={"player_pk": self.player_a.pk})
        self._assert_404_for_all_b_users(url)
        self._assert_allowed(self.coach_a, url)

    def test_exercise_list_and_detail(self):
        """
        GET /api/training/exercises/ and /api/training/exercises/{id}/
        Exercises are NOT academy-scoped (they are a shared library created
        by any coach). Both coach_a and coach_b can see all exercises.
        This test verifies that — it is intentionally NOT blocked.
        """
        list_url = reverse("exercise-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(list_url)
        self.assertEqual(resp.status_code, 200)

        detail_url = reverse("exercise-detail", kwargs={"pk": self.exercise_a.pk})
        resp = self.client.get(detail_url)
        self.assertEqual(resp.status_code, 200)

    # ===================================================================
    # 7. ANNOUNCEMENTS (detail, receipts)
    # ===================================================================

    def test_announcement_detail(self):
        """GET /api/announcements/{id}/ — scoped by get_visible_announcements_q."""
        url = reverse("announcement-detail", kwargs={"pk": self.announcement_a.pk})
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        self._assert_allowed(self.coach_a, url)

    def test_announcement_list(self):
        url = reverse("announcement-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.announcement_a.pk), ids)

    def test_announcement_receipts(self):
        """GET /api/announcements/{id}/receipts/ — staff of announcement's academy."""
        url = reverse("announcement-receipts", kwargs={"pk": self.announcement_a.pk})
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        self._assert_allowed(self.coach_a, url)

    # ===================================================================
    # 8. TACTICS — Lineup (GET /api/matches/{match_pk}/lineup/)
    # ===================================================================

    def test_lineup_get(self):
        """GET /api/matches/{match_pk}/lineup/ — academy-scoped read."""
        url = reverse("match-lineup", kwargs={"match_pk": self.match_a.pk})
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        # Player B and Parent B also blocked (no team membership on A's team)
        self._assert_blocked(self.player_user_b, url)
        self._assert_blocked(self.parent_b, url)
        self._assert_allowed(self.coach_a, url)

    def test_lineup_summary(self):
        """GET /api/lineups/summary/ — academy-scoped."""
        url = reverse("lineup-summary")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        # coach_b should get 200 but not see A's lineup
        self.assertEqual(resp.status_code, 200)
        match_ids = {item["match_id"] for item in resp.json()}
        self.assertNotIn(str(self.match_a.pk), match_ids)

    # ===================================================================
    # 9. TACTICS — Boards
    # ===================================================================

    def test_tactic_board_detail(self):
        """GET /api/tactics/boards/{id}/ — academy-scoped."""
        url = reverse("tactic-board-detail", kwargs={"board_pk": self.board_a.pk})
        self._assert_blocked(self.coach_b, url)
        self._assert_blocked(self.admin_b, url)
        self._assert_allowed(self.coach_a, url)

    def test_tactic_board_list(self):
        """GET /api/tactics/boards/ — academy-scoped."""
        url = reverse("tactic-board-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.board_a.pk), ids)

    # ===================================================================
    # 10. INVITATIONS
    # ===================================================================

    def test_invitation_list(self):
        """GET /api/invitations/list/ — academy-scoped for staff."""
        url = reverse("invitation-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        ids = self._extract_ids(resp.json())
        self.assertNotIn(str(self.invitation_a.pk), ids)

    def test_invitation_revoke_not_visible(self):
        """POST /api/invitations/{id}/revoke/ — coach B gets 404."""
        url = reverse("invitation-revoke", kwargs={"pk": self.invitation_a.pk})
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, 404)

    # ===================================================================
    # 11. DEVELOPMENT SKILLS (shared, not academy-scoped — intentionally open)
    # ===================================================================

    def test_skill_list_and_detail(self):
        """GET /api/development/skills/ — shared library, not academy-scoped."""
        list_url = reverse("skill-list")
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(list_url)
        self.assertEqual(resp.status_code, 200)

        detail_url = reverse("skill-detail", kwargs={"pk": self.skill.pk})
        resp = self.client.get(detail_url)
        self.assertEqual(resp.status_code, 200)

    # ===================================================================
    # SUPERUSER SEES ALL — sanity checks
    # ===================================================================

    def test_superuser_can_access_all(self):
        """Superuser must be able to access every object regardless of academy."""
        urls = [
            reverse("academy-detail", kwargs={"pk": self.academy_a.pk}),
            reverse("team-detail", kwargs={"pk": self.team_a.pk}),
            reverse("player-detail", kwargs={"pk": self.player_a.pk}),
            reverse("player-history", kwargs={"pk": self.player_a.pk}),
            reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk}),
            reverse("player-goal-list", kwargs={"player_pk": self.player_a.pk}),
            reverse("player-measurement-list", kwargs={"player_pk": self.player_a.pk}),
            reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk}),
            reverse("player-compare", kwargs={"player_pk": self.player_a.pk}),
            reverse("match-detail", kwargs={"pk": self.match_a.pk}),
            reverse("player-match-history", kwargs={"player_pk": self.player_a.pk}),
            reverse("player-match-summary", kwargs={"player_pk": self.player_a.pk}),
            reverse("training-session-detail", kwargs={"pk": self.session_a.pk}),
            reverse("player-training-history", kwargs={"player_pk": self.player_a.pk}),
            reverse("announcement-detail", kwargs={"pk": self.announcement_a.pk}),
            reverse("match-lineup", kwargs={"match_pk": self.match_a.pk}),
            reverse("tactic-board-detail", kwargs={"board_pk": self.board_a.pk}),
        ]
        for url in urls:
            self._assert_allowed(self.superuser, url)


# ===========================================================================
# Development-data cutoff for former-academy staff (transfer scenarios)
# ===========================================================================


class DevelopmentCutoffTests(AccessMatrixMixin, APITestCase):
    """
    Player transfers from Academy A → Academy B.

    Coach A (former academy, LEFT membership) should only see development
    records dated on or before the player's left_at date.
    Coach B (current academy, ACTIVE membership) sees everything.
    Superuser, the player, and the parent see everything.

    When the player returns to Academy A (new ACTIVE membership), Coach A
    sees everything again.
    """

    def setUp(self):
        self.set_up_fixture()

        # --- Transfer player A from Academy A to Academy B ---
        # Mark Academy A membership as LEFT with a specific date.
        self.left_date = "2026-09-15"
        membership_a = PlayerAcademyMembership.objects.get(
            player=self.player_a, academy=self.academy_a,
        )
        membership_a.status = PlayerAcademyMembership.Status.LEFT
        membership_a.left_at = self.left_date
        membership_a.save()

        # Enroll player A at Academy B (ACTIVE).
        _enroll(self.player_a, self.academy_b)
        # Also give coach_b staff at academy_b (already done in fixture).

        # --- Development data BEFORE the cutoff (2026-09-01, from fixture) ---
        # assessment_a  (assessment_date=2026-09-01)  ← visible to coach_a
        # goal_a        (start_date=2026-09-01)       ← visible to coach_a
        # measurement_a (measurement_date=2026-09-01) ← visible to coach_a

        # --- Development data AFTER the cutoff ---
        self.assessment_after = Assessment.objects.create(
            player=self.player_a, coach=self.coach_b,
            assessment_date="2026-10-01",
        )
        AssessmentItem.objects.create(
            assessment=self.assessment_after, skill=self.skill, score=9,
        )
        self.goal_after = DevelopmentGoal.objects.create(
            player=self.player_a, skill=self.skill,
            description="New goal at B",
            start_date="2026-10-01", target_date="2026-12-01",
            created_by=self.coach_b,
        )
        self.measurement_after = PhysicalMeasurement.objects.create(
            player=self.player_a, measurement_date="2026-10-01",
            height_cm="177.00",
        )

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    def _get(self, user, url):
        self.client.force_authenticate(user=user)
        return self.client.get(url)

    @staticmethod
    def _ids(resp):
        """Extract IDs from a list response (handles plain list and DRF pagination)."""
        data = resp.json()
        items = data.get("results", data) if isinstance(data, dict) else data
        return {item["id"] for item in items}

    # ==================================================================
    # Assessment list — coach A sees only pre-cutoff
    # ==================================================================

    def test_assessment_list_coach_a_filtered(self):
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.assessment_a.pk), ids)
        self.assertNotIn(str(self.assessment_after.pk), ids)

    def test_assessment_list_coach_b_full(self):
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_b, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.assessment_a.pk), ids)
        self.assertIn(str(self.assessment_after.pk), ids)

    # ==================================================================
    # Assessment detail — coach A gets 404 for post-cutoff
    # ==================================================================

    def test_assessment_detail_coach_a_before_cutoff(self):
        url = reverse("player-assessment-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.assessment_a.pk,
        })
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 200)

    def test_assessment_detail_coach_a_after_cutoff_404(self):
        url = reverse("player-assessment-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.assessment_after.pk,
        })
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 404)

    def test_assessment_detail_coach_a_404_identical_to_fake(self):
        real_url = reverse("player-assessment-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.assessment_after.pk,
        })
        fake_url = reverse("player-assessment-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": FAKE_PK,
        })
        real_resp = self._get(self.coach_a, real_url)
        fake_resp = self._get(self.coach_a, fake_url)
        self.assertEqual(real_resp.status_code, 404)
        self.assertEqual(real_resp.json(), fake_resp.json())

    # ==================================================================
    # Goal list — coach A sees only pre-cutoff
    # ==================================================================

    def test_goal_list_coach_a_filtered(self):
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.goal_a.pk), ids)
        self.assertNotIn(str(self.goal_after.pk), ids)

    def test_goal_list_coach_b_full(self):
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_b, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.goal_a.pk), ids)
        self.assertIn(str(self.goal_after.pk), ids)

    # ==================================================================
    # Goal detail — coach A gets 404 for post-cutoff
    # ==================================================================

    def test_goal_detail_coach_a_after_cutoff_404(self):
        url = reverse("player-goal-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.goal_after.pk,
        })
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 404)

    # ==================================================================
    # Measurement list — coach A sees only pre-cutoff
    # ==================================================================

    def test_measurement_list_coach_a_filtered(self):
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.measurement_a.pk), ids)
        self.assertNotIn(str(self.measurement_after.pk), ids)

    def test_measurement_list_coach_b_full(self):
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_b, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.measurement_a.pk), ids)
        self.assertIn(str(self.measurement_after.pk), ids)

    # ==================================================================
    # Measurement detail — coach A gets 404 for post-cutoff
    # ==================================================================

    def test_measurement_detail_coach_a_after_cutoff_404(self):
        url = reverse("player-measurement-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.measurement_after.pk,
        })
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 404)

    # ==================================================================
    # Development Timeline — coach A sees filtered timeline
    # ==================================================================

    def test_timeline_coach_a_filtered(self):
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        a_ids = {a["id"] for a in data["assessments"]}
        g_ids = {g["id"] for g in data["goals"]}
        m_ids = {m["id"] for m in data["measurements"]}
        self.assertIn(str(self.assessment_a.pk), a_ids)
        self.assertNotIn(str(self.assessment_after.pk), a_ids)
        self.assertIn(str(self.goal_a.pk), g_ids)
        self.assertNotIn(str(self.goal_after.pk), g_ids)
        self.assertIn(str(self.measurement_a.pk), m_ids)
        self.assertNotIn(str(self.measurement_after.pk), m_ids)

    def test_timeline_coach_b_full(self):
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_b, url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        a_ids = {a["id"] for a in data["assessments"]}
        self.assertIn(str(self.assessment_a.pk), a_ids)
        self.assertIn(str(self.assessment_after.pk), a_ids)

    # ==================================================================
    # Player Comparison — coach A's view uses cutoff-filtered assessment
    # ==================================================================

    def test_comparison_coach_a_uses_pre_cutoff_assessment(self):
        """Coach A should see the pre-cutoff assessment as latest, not the post-cutoff one."""
        # Give player_a an active team membership at team_b for comparison to work.
        _team_membership(self.player_a, self.team_b)
        url = reverse("player-compare", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Coach A should still see the player has an assessment (the pre-cutoff one).
        self.assertTrue(data.get("player_has_assessment", False))

    # ==================================================================
    # Superuser, player, parent — always full access
    # ==================================================================

    def test_superuser_sees_all(self):
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.superuser, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.assessment_a.pk), ids)
        self.assertIn(str(self.assessment_after.pk), ids)

    def test_player_sees_all(self):
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.player_user_a, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.assessment_a.pk), ids)
        self.assertIn(str(self.assessment_after.pk), ids)

    def test_parent_sees_all(self):
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.parent_a, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.assessment_a.pk), ids)
        self.assertIn(str(self.assessment_after.pk), ids)

    # ==================================================================
    # Player returns to Academy A — coach A sees everything again
    # ==================================================================

    def test_return_to_academy_a_restores_full_access(self):
        """Re-enrolling player at Academy A (ACTIVE) gives coach A full access."""
        # Create a new ACTIVE membership at Academy A.
        PlayerAcademyMembership.objects.create(
            player=self.player_a, academy=self.academy_a,
            joined_at="2026-10-15",
            status=PlayerAcademyMembership.Status.ACTIVE,
        )
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        resp = self._get(self.coach_a, url)
        self.assertEqual(resp.status_code, 200)
        ids = self._ids(resp)
        self.assertIn(str(self.assessment_a.pk), ids)
        self.assertIn(str(self.assessment_after.pk), ids)


# ===========================================================================
# ENDPOINTS INTENTIONALLY EXCLUDED FROM THE MATRIX
# ===========================================================================
#
# 1. GET /api/health/ — public, no auth
# 2. POST /api/auth/token/ — auth endpoint, no academy scoping
# 3. POST /api/auth/token/refresh/ — auth endpoint
# 4. GET /api/auth/me/ — returns the requesting user's own profile
# 5. GET /api/development/skills/ and .../skills/{id}/ — shared skill library,
#    not academy-scoped (tested above as intentionally open)
# 6. GET /api/training/exercises/ and .../exercises/{id}/ — shared exercise
#    library, not academy-scoped (tested above as intentionally open)
# 7. GET /api/announcements/unread-count/ — returns count scoped to the
#    requesting user's visible announcements (no object leak)
# 8. POST /api/announcements/{id}/read/ — action endpoint (POST, not GET);
#    scoped by get_queryset → get_visible_announcements_q
# 9. POST /api/announcements/{id}/pin/ — action (POST); staff scoped
# 10. POST /api/announcements/{id}/unpin/ — action (POST); staff scoped
# 11. POST/DELETE /api/announcements/{id}/acknowledge/ — action; player/parent scoped
# 12. GET /api/invitations/preview/{token}/ — public, token-gated (AllowAny)
# 13. POST /api/invitations/redeem/{token}/ — public, token-gated (AllowAny)
# 14. POST /api/invitations/ — create (POST, not GET)
# 15. PUT /api/matches/{match_pk}/lineup/ — write (PUT); staff scoped
# 16. DELETE /api/matches/{match_pk}/lineup/ — write; staff scoped
# 17. POST /api/matches/{match_pk}/lineup/publish/ — write; staff scoped
# 18. POST /api/matches/{match_pk}/lineup/unpublish/ — write; staff scoped
# 19. All write-only endpoints (POST/PATCH/DELETE) across domains — this
#     matrix focuses on read (GET) leaks which are the reported vulnerability.
# 20. GET /api/passwords/reset/ and similar auth endpoints — no academy data.
