"""
Cross-academy isolation tests for player detail and history endpoints.

PROVES the bug: a COACH/ACADEMY_ADMIN of academy B can read the full profile
(including date_of_birth) of a player belonging only to academy A via
GET /api/players/{id}/ and GET /api/players/{id}/history/.

These tests must FAIL before the fix and PASS after.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import (
    Academy,
    AcademyStaffMembership,
    PlayerAcademyMembership,
)
from apps.players.models import Player
from apps.teams.models import PlayerTeamMembership, Team
from apps.users.models import ParentPlayerLink, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user(role, email, **kw):
    return User.objects.create_user(
        email=email, password="testpass123",
        first_name="Test", last_name="User", role=role, **kw,
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


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------

class TwoAcademyMixin:
    def set_up_two_academies(self):
        self.academy_a = _academy("Academy A")
        self.coach_a = _user(User.Role.COACH, "coach_a@t.com")
        _staff(self.coach_a, self.academy_a)
        self.team_a = _team(self.academy_a, "A U15")
        self.player_user_a = _user(User.Role.PLAYER, "player_a@t.com")
        self.player_a = _player("Alice", "Alpha", user=self.player_user_a)
        _enroll(self.player_a, self.academy_a)
        PlayerTeamMembership.objects.create(
            player=self.player_a, team=self.team_a, joined_at="2026-01-01",
        )

        self.academy_b = _academy("Academy B")
        self.coach_b = _user(User.Role.COACH, "coach_b@t.com")
        _staff(self.coach_b, self.academy_b)
        self.admin_b = _user(User.Role.ACADEMY_ADMIN, "admin_b@t.com")
        _staff(self.admin_b, self.academy_b)
        self.player_user_b = _user(User.Role.PLAYER, "player_b@t.com")
        self.player_b = _player("Bob", "Bravo", user=self.player_user_b)
        _enroll(self.player_b, self.academy_b)

        self.parent_a = _user(User.Role.PARENT, "parent_a@t.com")
        ParentPlayerLink.objects.create(parent=self.parent_a, player=self.player_a)

        # Non-existent player id for body-comparison
        import uuid
        self.non_existent_pk = uuid.uuid4()


# ===========================================================================
# Player detail — GET /api/players/{id}/
# ===========================================================================

class PlayerDetailCrossAcademyTests(TwoAcademyMixin, APITestCase):
    def setUp(self):
        self.set_up_two_academies()

    def test_coach_b_cannot_read_player_a_detail(self):
        """BUG: coach B gets 200 + full profile of player A (incl. DOB)."""
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_b_cannot_read_player_a_detail(self):
        self.client.force_authenticate(user=self.admin_b)
        url = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_academy_404_body_matches_nonexistent(self):
        """Response body for unauthorized must be identical to non-existent."""
        self.client.force_authenticate(user=self.coach_b)
        real_url = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        fake_url = reverse("player-detail", kwargs={"pk": self.non_existent_pk})
        real_resp = self.client.get(real_url)
        fake_resp = self.client.get(fake_url)
        self.assertEqual(real_resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(real_resp.json(), fake_resp.json())


# ===========================================================================
# Player history — GET /api/players/{id}/history/
# ===========================================================================

class PlayerHistoryCrossAcademyTests(TwoAcademyMixin, APITestCase):
    def setUp(self):
        self.set_up_two_academies()

    def test_coach_b_cannot_read_player_a_history(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-history", kwargs={"pk": self.player_a.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_b_cannot_read_player_a_history(self):
        self.client.force_authenticate(user=self.admin_b)
        url = reverse("player-history", kwargs={"pk": self.player_a.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_academy_history_404_body_matches_nonexistent(self):
        self.client.force_authenticate(user=self.coach_b)
        real_url = reverse("player-history", kwargs={"pk": self.player_a.pk})
        fake_url = reverse("player-history", kwargs={"pk": self.non_existent_pk})
        real_resp = self.client.get(real_url)
        fake_resp = self.client.get(fake_url)
        self.assertEqual(real_resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(real_resp.json(), fake_resp.json())
