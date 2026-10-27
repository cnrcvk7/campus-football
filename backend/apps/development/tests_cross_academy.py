"""
Cross-academy isolation tests for development READ endpoints.

Verifies that COACH / ACADEMY_ADMIN users cannot read development data
(assessments, goals, measurements, timeline, comparison) of players who
have NO PlayerAcademyMembership (any status) at an academy the user staffs.

Setup mirrors apps/academies/tests_cross_academy.py: two academies (A and B),
each with a coach-staff member, a player enrolled in that academy and a team.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import (
    Academy,
    AcademyStaffMembership,
    PlayerAcademyMembership,
)
from apps.development.models import (
    Assessment,
    AssessmentItem,
    DevelopmentGoal,
    PhysicalMeasurement,
    Skill,
)
from apps.players.models import Player
from apps.teams.models import PlayerTeamMembership, Team
from apps.users.models import ParentPlayerLink, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(role, email, password="testpass123", **extra) -> User:
    return User.objects.create_user(
        email=email, password=password,
        first_name="Test", last_name="User", role=role, **extra,
    )


def make_superuser(email="super@test.com") -> User:
    return User.objects.create_superuser(
        email=email, password="testpass123",
        first_name="Super", last_name="Admin",
    )


def make_academy(name) -> Academy:
    return Academy.objects.create(name=name, city="City", country="Country")


def make_team(academy, name) -> Team:
    return Team.objects.create(academy=academy, name=name)


def make_player(first_name="Test", last_name="Player", user=None) -> Player:
    p = Player.objects.create(
        first_name=first_name, last_name=last_name,
        date_of_birth="2008-01-01", gender="M",
    )
    if user is not None:
        p.user = user
        p.save()
    return p


def make_staff(user, academy) -> AcademyStaffMembership:
    return AcademyStaffMembership.objects.create(user=user, academy=academy)


def enroll_player(player, academy) -> PlayerAcademyMembership:
    return PlayerAcademyMembership.objects.create(
        player=player, academy=academy, joined_at="2026-01-01",
    )


def assign_team(player, team) -> PlayerTeamMembership:
    return PlayerTeamMembership.objects.create(
        player=player, team=team, joined_at="2026-01-01",
    )


# ---------------------------------------------------------------------------
# Shared fixture
# ---------------------------------------------------------------------------

class DevelopmentCrossAcademyMixin:
    """
    Two academies, each with a coach, team, player, and development data.
    Also: an admin of A, a coach with no memberships, a superuser,
    a PLAYER-role user linked to player_a, and a PARENT linked to player_a.
    """

    def set_up_two_academies(self):
        # Academy A
        self.academy_a = make_academy("Academy A")
        self.coach_a = make_user(User.Role.COACH, "coach_a@test.com")
        make_staff(self.coach_a, self.academy_a)
        self.team_a = make_team(self.academy_a, "A U15")
        self.player_a = make_player("Alice", "Alpha")
        enroll_player(self.player_a, self.academy_a)
        assign_team(self.player_a, self.team_a)

        # Academy B
        self.academy_b = make_academy("Academy B")
        self.coach_b = make_user(User.Role.COACH, "coach_b@test.com")
        make_staff(self.coach_b, self.academy_b)
        self.team_b = make_team(self.academy_b, "B U15")
        self.player_b = make_player("Bob", "Bravo")
        enroll_player(self.player_b, self.academy_b)
        assign_team(self.player_b, self.team_b)

        # Admin of A
        self.admin_a = make_user(User.Role.ACADEMY_ADMIN, "admin_a@test.com")
        make_staff(self.admin_a, self.academy_a)

        # Coach with no memberships
        self.coach_none = make_user(User.Role.COACH, "coach_none@test.com")

        # Superuser
        self.superuser = make_superuser()

        # PLAYER-role user linked to player_a
        self.player_user_a = make_user(User.Role.PLAYER, "player_a@test.com")
        self.player_a.user = self.player_user_a
        self.player_a.save()

        # PARENT linked to player_a
        self.parent_a = make_user(User.Role.PARENT, "parent_a@test.com")
        ParentPlayerLink.objects.create(parent=self.parent_a, player=self.player_a)

        # Seed a skill for assessments / goals
        self.skill = Skill.objects.create(
            name="Dribbling", category="TECHNICAL",
        )

        # Development data for player_a
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

        # Development data for player_b
        self.assessment_b = Assessment.objects.create(
            player=self.player_b, coach=self.coach_b,
            assessment_date="2026-09-01",
        )
        AssessmentItem.objects.create(
            assessment=self.assessment_b, skill=self.skill, score=5,
        )
        self.goal_b = DevelopmentGoal.objects.create(
            player=self.player_b, skill=self.skill,
            description="Improve passing",
            start_date="2026-09-01", target_date="2026-12-01",
            created_by=self.coach_b,
        )
        self.measurement_b = PhysicalMeasurement.objects.create(
            player=self.player_b, measurement_date="2026-09-01",
            height_cm="170.00",
        )


# ===========================================================================
# 1. Assessments — cross-academy reads must return 404
# ===========================================================================

class AssessmentCrossAcademyTests(DevelopmentCrossAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()

    # --- Coach B reading player A's assessments → 404 ---

    def test_coach_b_cannot_list_player_a_assessments(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_b_cannot_retrieve_player_a_assessment(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-assessment-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.assessment_a.pk,
        })
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_a_cannot_list_player_b_assessments(self):
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_none_cannot_list_player_a_assessments(self):
        self.client.force_authenticate(user=self.coach_none)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Authorized reads still work ---

    def test_coach_a_can_list_player_a_assessments(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_superuser_can_list_player_a_assessments(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_player_user_can_list_own_assessments(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_parent_can_list_linked_player_assessments(self):
        self.client.force_authenticate(user=self.parent_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 2. Goals — cross-academy reads must return 404
# ===========================================================================

class GoalCrossAcademyTests(DevelopmentCrossAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()

    def test_coach_b_cannot_list_player_a_goals(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_b_cannot_retrieve_player_a_goal(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-goal-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.goal_a.pk,
        })
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_a_cannot_list_player_b_goals(self):
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_none_cannot_list_player_a_goals(self):
        self.client.force_authenticate(user=self.coach_none)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Authorized ---

    def test_coach_a_can_list_player_a_goals(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_superuser_can_list_player_b_goals(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 3. Measurements — cross-academy reads must return 404
# ===========================================================================

class MeasurementCrossAcademyTests(DevelopmentCrossAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()

    def test_coach_b_cannot_list_player_a_measurements(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_b_cannot_retrieve_player_a_measurement(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-measurement-detail", kwargs={
            "player_pk": self.player_a.pk, "pk": self.measurement_a.pk,
        })
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_a_cannot_list_player_b_measurements(self):
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_none_cannot_list_player_a_measurements(self):
        self.client.force_authenticate(user=self.coach_none)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Authorized ---

    def test_coach_a_can_list_player_a_measurements(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_superuser_can_list_any_measurements(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 4. Timeline — cross-academy reads must return 404
# ===========================================================================

class TimelineCrossAcademyTests(DevelopmentCrossAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()

    def test_coach_b_cannot_read_player_a_timeline(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_a_cannot_read_player_b_timeline(self):
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_none_cannot_read_player_a_timeline(self):
        self.client.force_authenticate(user=self.coach_none)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Authorized ---

    def test_coach_a_can_read_player_a_timeline(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_superuser_can_read_any_timeline(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_player_user_can_read_own_timeline(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_parent_can_read_linked_player_timeline(self):
        self.client.force_authenticate(user=self.parent_a)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 5. Comparison — cross-academy reads must return 404
# ===========================================================================

class ComparisonCrossAcademyTests(DevelopmentCrossAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()

    def test_coach_b_cannot_read_player_a_comparison(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-compare", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_a_cannot_read_player_b_comparison(self):
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-compare", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_none_cannot_read_player_a_comparison(self):
        self.client.force_authenticate(user=self.coach_none)
        url = reverse("player-compare", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Authorized ---

    def test_coach_a_can_read_player_a_comparison(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-compare", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_superuser_can_read_any_comparison(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-compare", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 6. Former academy — coach can still READ after player left
# ===========================================================================

class FormerAcademyReadTests(DevelopmentCrossAcademyMixin, APITestCase):
    """
    A player who left academy A should still be readable by coach A
    (any-status membership rule), but not writable.
    """

    def setUp(self):
        self.set_up_two_academies()
        # Player A leaves Academy A
        m = PlayerAcademyMembership.objects.get(
            player=self.player_a, academy=self.academy_a,
        )
        m.status = PlayerAcademyMembership.Status.LEFT
        m.left_at = "2026-09-01"
        m.save()

    def test_coach_a_can_still_list_former_player_assessments(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_coach_a_can_still_read_former_player_timeline(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-development-timeline", kwargs={"player_pk": self.player_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_coach_a_cannot_write_former_player_assessment(self):
        """Write still requires ACTIVE membership — existing rule preserved."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_a.pk})
        payload = {
            "assessment_date": "2026-10-01",
            "items": [{"skill": str(self.skill.pk), "score": 8}],
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ===========================================================================
# 7. PLAYER/PARENT cross-player isolation (regression)
# ===========================================================================

class PlayerParentIsolationTests(DevelopmentCrossAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()

    def test_player_user_cannot_read_other_player_assessments(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertIn(response.status_code, (
            status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND,
        ))

    def test_parent_cannot_read_unlinked_player_assessments(self):
        self.client.force_authenticate(user=self.parent_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_b.pk})
        response = self.client.get(url)
        self.assertIn(response.status_code, (
            status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND,
        ))
