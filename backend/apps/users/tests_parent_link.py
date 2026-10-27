"""
Tests for ParentPlayerLink authorization model.

Verifies that:
1. A PLAYER can read their own development data.
2. A PLAYER cannot read another player's development data.
3. A linked PARENT can read their linked player's development data.
4. An unlinked PARENT cannot read any player's development data.
5. A PARENT cannot modify (create/update) development data.
6. A COACH can read any player's development data.
7. An ACADEMY_ADMIN can read any player's development data.
8. An unauthenticated request is rejected (401).
9. Isolation: a parent linked to player A cannot access player B.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.players.models import Player
from apps.users.models import ParentPlayerLink, User
from apps.development.models import Skill, Assessment, AssessmentItem


def make_user(role, email):
    return User.objects.create_user(
        email=email, password="testpass", first_name="Test", last_name="User", role=role
    )


def make_player(user=None):
    p = Player.objects.create(
        first_name="John", last_name="Doe",
        date_of_birth="2005-01-01", gender="M",
    )
    if user:
        p.user = user
        p.save()
    return p


class ParentPlayerLinkAuthTests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach@test.com")
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "admin@test.com")
        self.player_user = make_user(User.Role.PLAYER, "player@test.com")
        self.player = make_player(user=self.player_user)
        self.other_player = make_player()
        self.parent = make_user(User.Role.PARENT, "parent@test.com")
        self.other_parent = make_user(User.Role.PARENT, "other_parent@test.com")
        # Link parent -> player (but not other_player)
        ParentPlayerLink.objects.create(parent=self.parent, player=self.player)
        # Academy affiliation for coach and admin (required after cross-academy read fix).
        self.academy = Academy.objects.create(name="Parent Test Academy", city="London", country="UK")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2024-01-01"
        )
        PlayerAcademyMembership.objects.create(
            player=self.other_player, academy=self.academy, joined_at="2024-01-01"
        )
        # Create a skill and assessment for testing
        self.skill = Skill.objects.create(name="Passing", category="TECHNICAL")
        self.assessment = Assessment.objects.create(
            player=self.player, coach=self.coach, assessment_date="2026-01-01"
        )
        AssessmentItem.objects.create(assessment=self.assessment, skill=self.skill, score=70)

    def _timeline_url(self, player):
        return f"/api/players/{player.pk}/development/timeline/"

    def _matches_url(self, player):
        return f"/api/players/{player.pk}/matches/"

    def _training_url(self, player):
        return f"/api/players/{player.pk}/training/history/"

    # --- PLAYER ---
    def test_player_can_read_own_timeline(self):
        self.client.force_authenticate(self.player_user)
        r = self.client.get(self._timeline_url(self.player))
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_player_cannot_read_other_timeline(self):
        self.client.force_authenticate(self.player_user)
        r = self.client.get(self._timeline_url(self.other_player))
        self.assertIn(r.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    # --- PARENT (linked) ---
    def test_linked_parent_can_read_timeline(self):
        self.client.force_authenticate(self.parent)
        r = self.client.get(self._timeline_url(self.player))
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_linked_parent_can_read_matches(self):
        self.client.force_authenticate(self.parent)
        r = self.client.get(self._matches_url(self.player))
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_linked_parent_can_read_training(self):
        self.client.force_authenticate(self.parent)
        r = self.client.get(self._training_url(self.player))
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    # --- PARENT (unlinked) ---
    def test_unlinked_parent_cannot_read_timeline(self):
        self.client.force_authenticate(self.other_parent)
        r = self.client.get(self._timeline_url(self.player))
        self.assertIn(r.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_unlinked_parent_cannot_read_matches(self):
        self.client.force_authenticate(self.other_parent)
        r = self.client.get(self._matches_url(self.player))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_unlinked_parent_cannot_read_training(self):
        self.client.force_authenticate(self.other_parent)
        r = self.client.get(self._training_url(self.player))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    # --- Isolation ---
    def test_parent_linked_to_player_a_cannot_read_player_b(self):
        self.client.force_authenticate(self.parent)
        r = self.client.get(self._timeline_url(self.other_player))
        self.assertIn(r.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    # --- PARENT cannot write ---
    def test_linked_parent_cannot_create_assessment(self):
        self.client.force_authenticate(self.parent)
        url = f"/api/players/{self.player.pk}/assessments/"
        r = self.client.post(url, {
            "assessment_date": "2026-02-01",
            "items": [{"skill": str(self.skill.pk), "score": 80}]
        }, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    # --- COACH and ADMIN ---
    def test_coach_can_read_any_player_timeline(self):
        self.client.force_authenticate(self.coach)
        r = self.client.get(self._timeline_url(self.other_player))
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_admin_can_read_any_player_timeline(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get(self._timeline_url(self.other_player))
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    # --- Unauthenticated ---
    def test_unauthenticated_request_rejected(self):
        r = self.client.get(self._timeline_url(self.player))
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- No duplicate link ---
    def test_duplicate_link_not_allowed(self):
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            ParentPlayerLink.objects.create(parent=self.parent, player=self.player)
