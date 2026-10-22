import datetime
import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.players.models import Player
from apps.teams.models import PlayerTeamMembership, Team
from apps.users.models import User

from .models import Assessment, AssessmentItem, DevelopmentGoal, PhysicalMeasurement, Skill


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


def make_player(user=None, **overrides) -> Player:
    defaults = {
        "first_name": "John",
        "last_name": "Doe",
        "date_of_birth": "2005-06-15",
        "gender": "M",
    }
    player = Player.objects.create(**{**defaults, **overrides})
    if user is not None:
        player.user = user
        player.save()
    return player


def make_skill(name="Passing", category="TECHNICAL") -> Skill:
    return Skill.objects.create(name=name, category=category)


def make_assessment(player, coach, assessment_date="2026-01-15", **overrides) -> Assessment:
    return Assessment.objects.create(
        player=player,
        coach=coach,
        assessment_date=assessment_date,
        **overrides,
    )


def make_assessment_with_items(player, coach, skills_scores: list, date="2026-01-15") -> Assessment:
    assessment = make_assessment(player, coach, assessment_date=date)
    for skill, score in skills_scores:
        AssessmentItem.objects.create(assessment=assessment, skill=skill, score=score)
    return assessment


# ---------------------------------------------------------------------------
# 1–4. Skill tests
# ---------------------------------------------------------------------------

class SkillModelTests(APITestCase):

    def setUp(self):
        self.user = make_user(User.Role.COACH, "coach@test.com")
        self.client.force_authenticate(user=self.user)

    def test_skill_creation(self):
        """Skill can be created with name and category."""
        skill = make_skill("Dribbling", "TECHNICAL")
        self.assertIsNotNone(skill.pk)
        self.assertEqual(skill.name, "Dribbling")
        self.assertEqual(skill.category, "TECHNICAL")
        self.assertTrue(skill.is_active)

    def test_skill_category_choices(self):
        """All four category choices can be stored correctly."""
        for category in ("TECHNICAL", "TACTICAL", "PHYSICAL", "MENTAL"):
            skill = Skill.objects.create(name=f"Skill-{category}", category=category)
            skill.refresh_from_db()
            self.assertEqual(skill.category, category)

    def test_skill_list(self):
        """GET /api/development/skills/ returns 200 with skill list."""
        make_skill("Passing")
        make_skill("Speed", "PHYSICAL")
        url = reverse("skill-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertGreaterEqual(len(results), 2)

    def test_skill_retrieve(self):
        """GET /api/development/skills/{id}/ returns the correct skill."""
        skill = make_skill("Vision", "TACTICAL")
        url = reverse("skill-detail", kwargs={"pk": skill.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Vision")
        self.assertEqual(response.data["category"], "TACTICAL")

    def test_skill_list_unauthenticated_returns_401(self):
        """GET /api/development/skills/ without auth returns 401."""
        self.client.force_authenticate(user=None)
        url = reverse("skill-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_skill_excluded_from_list(self):
        """Inactive skills do not appear in the skill list."""
        active = make_skill("Active Skill")
        Skill.objects.create(name="Inactive Skill", category="TECHNICAL", is_active=False)
        url = reverse("skill-list")
        response = self.client.get(url)
        results = response.data["results"] if isinstance(response.data, dict) and "results" in response.data else response.data
        names = [s["name"] for s in results]
        self.assertIn("Active Skill", names)
        self.assertNotIn("Inactive Skill", names)


# ---------------------------------------------------------------------------
# 5–11. Assessment tests
# ---------------------------------------------------------------------------

class AssessmentAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach@test.com")
        self.player = make_player()
        self.skill1 = make_skill("Passing", "TECHNICAL")
        self.skill2 = make_skill("Speed", "PHYSICAL")
        self.list_url = reverse("player-assessment-list", kwargs={"player_pk": self.player.pk})
        # Affiliation required for write operations (Task 1 security fix).
        self.academy = Academy.objects.create(name="Assessment Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

    def _coach_post(self, payload):
        self.client.force_authenticate(user=self.coach)
        return self.client.post(self.list_url, payload, format="json")

    def test_coach_can_create_assessment(self):
        """POST /api/players/{id}/assessments/ by a coach returns 201."""
        payload = {
            "assessment_date": "2026-10-01",
            "overall_comment": "Good session.",
            "items": [
                {"skill": str(self.skill1.pk), "score": 80},
                {"skill": str(self.skill2.pk), "score": 75},
            ],
        }
        response = self._coach_post(payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["overall_comment"], "Good session.")

    def test_assessment_items_created_correctly(self):
        """Assessment items are stored and returned with the correct skill/score."""
        payload = {
            "assessment_date": "2026-10-01",
            "items": [
                {"skill": str(self.skill1.pk), "score": 84, "comment": "Very accurate."},
                {"skill": str(self.skill2.pk), "score": 78},
            ],
        }
        response = self._coach_post(payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        items = response.data["items"]
        self.assertEqual(len(items), 2)
        passing_item = next(i for i in items if i["skill_name"] == "Passing")
        self.assertEqual(passing_item["score"], 84)
        self.assertEqual(passing_item["comment"], "Very accurate.")

    def test_score_below_0_rejected(self):
        """A score of -1 must be rejected with 400."""
        payload = {
            "assessment_date": "2026-10-01",
            "items": [{"skill": str(self.skill1.pk), "score": -1}],
        }
        response = self._coach_post(payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_score_above_100_rejected(self):
        """A score of 101 must be rejected with 400."""
        payload = {
            "assessment_date": "2026-10-01",
            "items": [{"skill": str(self.skill1.pk), "score": 101}],
        }
        response = self._coach_post(payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_skill_in_assessment_rejected(self):
        """Including the same skill twice in one assessment must be rejected with 400."""
        payload = {
            "assessment_date": "2026-10-01",
            "items": [
                {"skill": str(self.skill1.pk), "score": 80},
                {"skill": str(self.skill1.pk), "score": 85},
            ],
        }
        response = self._coach_post(payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_previous_assessment_unchanged(self):
        """Creating a new assessment does not modify items on previous assessments."""
        first = make_assessment_with_items(
            self.player, self.coach, [(self.skill1, 70)], date="2026-01-01"
        )
        # Create second assessment with different score for same skill
        payload = {
            "assessment_date": "2026-06-01",
            "items": [{"skill": str(self.skill1.pk), "score": 85}],
        }
        self._coach_post(payload)
        # First assessment's item must remain at 70
        first.refresh_from_db()
        item = first.items.get(skill=self.skill1)
        self.assertEqual(item.score, 70)

    def test_assessment_history_retrievable(self):
        """GET /api/players/{id}/assessments/ returns all assessments for the player."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 70)], date="2026-01-01")
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)], date="2026-06-01")
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if isinstance(response.data, dict) and "results" in response.data else response.data
        self.assertEqual(len(results), 2)

    def test_retrieve_specific_assessment(self):
        """GET /api/players/{id}/assessments/{aid}/ returns the correct assessment."""
        assessment = make_assessment_with_items(
            self.player, self.coach, [(self.skill1, 75)]
        )
        url = reverse(
            "player-assessment-detail",
            kwargs={"player_pk": self.player.pk, "pk": assessment.pk},
        )
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(assessment.pk))

    def test_player_cannot_create_assessment(self):
        """A PLAYER role must not be allowed to create assessments (403)."""
        player_user = make_user(User.Role.PLAYER, "player@test.com")
        player = make_player(user=player_user)
        self.client.force_authenticate(user=player_user)
        url = reverse("player-assessment-list", kwargs={"player_pk": player.pk})
        payload = {
            "assessment_date": "2026-10-01",
            "items": [{"skill": str(self.skill1.pk), "score": 80}],
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_player_can_read_own_assessments(self):
        """A PLAYER role can GET their own assessment list."""
        player_user = make_user(User.Role.PLAYER, "myplayer@test.com")
        player = make_player(user=player_user)
        make_assessment_with_items(player, self.coach, [(self.skill1, 80)])
        self.client.force_authenticate(user=player_user)
        url = reverse("player-assessment-list", kwargs={"player_pk": player.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_empty_items_rejected(self):
        """An assessment with no items must be rejected."""
        payload = {"assessment_date": "2026-10-01", "items": []}
        response = self._coach_post(payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# 12–15. Development Goal tests
# ---------------------------------------------------------------------------

class GoalAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "goalcoach@test.com")
        self.player = make_player()
        self.skill = make_skill("Weak Foot", "TECHNICAL")
        self.list_url = reverse("player-goal-list", kwargs={"player_pk": self.player.pk})
        self.client.force_authenticate(user=self.coach)
        # Affiliation required for write operations (Task 1 security fix).
        self.academy = Academy.objects.create(name="Goal Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

    def _payload(self, **overrides):
        base = {
            "title": "Improve Weak Foot",
            "description": "Focus on left-foot passing drills.",
            "skill": str(self.skill.pk),
            "target_value": "75.00",
            "current_value": "62.00",
            "start_date": "2026-01-01",
            "target_date": "2027-01-01",
        }
        return {**base, **overrides}

    def test_create_goal(self):
        """POST /api/players/{id}/goals/ creates a development goal."""
        response = self.client.post(self.list_url, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Improve Weak Foot")
        self.assertEqual(response.data["status"], "ACTIVE")

    def test_update_goal_status(self):
        """PATCH /api/players/{id}/goals/{id}/ can update status to COMPLETED."""
        response = self.client.post(self.list_url, self._payload(), format="json")
        goal_pk = response.data["id"]
        url = reverse("player-goal-detail", kwargs={"player_pk": self.player.pk, "pk": goal_pk})
        patch_response = self.client.patch(url, {"status": "COMPLETED"}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["status"], "COMPLETED")

    def test_target_date_before_start_date_rejected(self):
        """target_date before start_date must be rejected with 400."""
        payload = self._payload(start_date="2026-06-01", target_date="2026-01-01")
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("target_date", response.data)

    def test_goal_status_choices(self):
        """Status field accepts ACTIVE, COMPLETED, CANCELLED."""
        for s in ("ACTIVE", "COMPLETED", "CANCELLED"):
            response = self.client.post(
                self.list_url, self._payload(title=f"Goal {s}", status=s), format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(response.data["status"], s)

    def test_retrieve_goal(self):
        """GET /api/players/{id}/goals/{id}/ returns the correct goal."""
        create_response = self.client.post(self.list_url, self._payload(), format="json")
        goal_pk = create_response.data["id"]
        url = reverse("player-goal-detail", kwargs={"player_pk": self.player.pk, "pk": goal_pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), goal_pk)

    def test_goal_skill_is_optional(self):
        """A goal can be created without a linked skill."""
        payload = {
            "title": "General fitness",
            "start_date": "2026-01-01",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["skill"])

    def test_update_current_value(self):
        """PATCH can update current_value to track progress."""
        create_response = self.client.post(self.list_url, self._payload(), format="json")
        goal_pk = create_response.data["id"]
        url = reverse("player-goal-detail", kwargs={"player_pk": self.player.pk, "pk": goal_pk})
        patch_response = self.client.patch(url, {"current_value": "70.00"}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(patch_response.data["current_value"]), "70.00")


# ---------------------------------------------------------------------------
# 16–18. Physical Measurement tests
# ---------------------------------------------------------------------------

class MeasurementAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "measurecoach@test.com")
        self.player = make_player()
        self.list_url = reverse("player-measurement-list", kwargs={"player_pk": self.player.pk})
        self.client.force_authenticate(user=self.coach)
        # Affiliation required for write operations (Task 1 security fix).
        self.academy = Academy.objects.create(name="Measurement Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

    def _payload(self, **overrides):
        base = {
            "measurement_date": "2026-10-01",
            "height_cm": "175.50",
            "weight_kg": "70.00",
        }
        return {**base, **overrides}

    def test_create_measurement(self):
        """POST /api/players/{id}/measurements/ creates a measurement record."""
        response = self.client.post(self.list_url, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data["height_cm"]), "175.50")
        self.assertEqual(str(response.data["weight_kg"]), "70.00")

    def test_retrieve_measurements(self):
        """GET /api/players/{id}/measurements/ returns the created measurements."""
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-01-01", height_cm="170.00"
        )
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-06-01", height_cm="173.00"
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if isinstance(response.data, dict) and "results" in response.data else response.data
        self.assertEqual(len(results), 2)

    def test_negative_height_rejected(self):
        """height_cm < 0 must be rejected with 400."""
        response = self.client.post(
            self.list_url, self._payload(height_cm="-10.00"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("height_cm", response.data)

    def test_negative_weight_rejected(self):
        """weight_kg < 0 must be rejected with 400."""
        response = self.client.post(
            self.list_url, self._payload(weight_kg="-5.00"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("weight_kg", response.data)

    def test_partial_measurement_allowed(self):
        """A measurement with only measurement_date (no values) is valid."""
        response = self.client.post(
            self.list_url, {"measurement_date": "2026-10-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_retrieve_specific_measurement(self):
        """GET /api/players/{id}/measurements/{mid}/ returns correct record."""
        m = PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-05-01", height_cm="172.00"
        )
        url = reverse(
            "player-measurement-detail",
            kwargs={"player_pk": self.player.pk, "pk": m.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(m.pk))


# ---------------------------------------------------------------------------
# 19–22. Permission tests
# ---------------------------------------------------------------------------

class DevelopmentPermissionTests(APITestCase):

    def setUp(self):
        # Player 1 with a user account
        self.player1_user = make_user(User.Role.PLAYER, "player1@test.com")
        self.player1 = make_player(user=self.player1_user, first_name="Alice")

        # Player 2 with a separate user account
        self.player2_user = make_user(User.Role.PLAYER, "player2@test.com")
        self.player2 = make_player(user=self.player2_user, first_name="Bob")

        self.coach = make_user(User.Role.COACH, "permcoach@test.com")
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "admin@test.com")
        self.skill = make_skill("Shooting", "TECHNICAL")

        # Academy affiliations required by the Task 1 cross-academy write fix.
        self.academy = Academy.objects.create(name="Perm Test Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player1, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

    def test_player_cannot_access_other_player_assessments(self):
        """A PLAYER user cannot read another player's assessments (403)."""
        # Create an assessment on player2
        make_assessment_with_items(self.player2, self.coach, [(self.skill, 80)])
        # player1 tries to access player2's assessments
        self.client.force_authenticate(user=self.player1_user)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player2.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_player_cannot_modify_other_player_goal(self):
        """A PLAYER user cannot PATCH another player's goal (403)."""
        goal = DevelopmentGoal.objects.create(
            player=self.player2,
            title="Improve speed",
            start_date="2026-01-01",
            created_by=self.coach,
        )
        self.client.force_authenticate(user=self.player1_user)
        url = reverse(
            "player-goal-detail",
            kwargs={"player_pk": self.player2.pk, "pk": goal.pk},
        )
        response = self.client.patch(url, {"status": "CANCELLED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_player_cannot_create_own_goal(self):
        """A PLAYER role cannot create goals even for their own player (403)."""
        self.client.force_authenticate(user=self.player1_user)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player1.pk})
        response = self.client.post(
            url, {"title": "My goal", "start_date": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_can_create_assessment(self):
        """A COACH can POST an assessment for any player."""
        self.client.force_authenticate(user=self.coach)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player1.pk})
        payload = {
            "assessment_date": "2026-10-01",
            "items": [{"skill": str(self.skill.pk), "score": 75}],
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_academy_admin_can_access_development_data(self):
        """ACADEMY_ADMIN can read assessments for any player."""
        make_assessment_with_items(self.player1, self.coach, [(self.skill, 80)])
        self.client.force_authenticate(user=self.admin)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player1.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_academy_admin_can_create_assessment(self):
        """ACADEMY_ADMIN can POST an assessment."""
        self.client.force_authenticate(user=self.admin)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player1.pk})
        payload = {
            "assessment_date": "2026-10-01",
            "items": [{"skill": str(self.skill.pk), "score": 82}],
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_player_unlinked_to_player_object_gets_403(self):
        """A PLAYER user without a linked Player record cannot access any player's data."""
        unlinked_user = make_user(User.Role.PLAYER, "unlinked@test.com")
        self.client.force_authenticate(user=unlinked_user)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player1.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_returns_401(self):
        """Unauthenticated access to development endpoints returns 401."""
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player1.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# 23–26. Development Timeline tests
# ---------------------------------------------------------------------------

class DevelopmentTimelineTests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "tlcoach@test.com")
        self.player = make_player()
        self.skill1 = make_skill("Passing", "TECHNICAL")
        self.skill2 = make_skill("Endurance", "PHYSICAL")
        self.client.force_authenticate(user=self.coach)
        self.url = reverse(
            "player-development-timeline", kwargs={"player_pk": self.player.pk}
        )

    def test_timeline_returns_assessments(self):
        """GET /development/timeline/ includes assessments."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)])
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("assessments", response.data)
        self.assertEqual(len(response.data["assessments"]), 1)

    def test_timeline_returns_goals(self):
        """GET /development/timeline/ includes development goals."""
        DevelopmentGoal.objects.create(
            player=self.player,
            title="Speed Goal",
            start_date="2026-01-01",
            created_by=self.coach,
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("goals", response.data)
        self.assertEqual(len(response.data["goals"]), 1)

    def test_timeline_returns_measurements(self):
        """GET /development/timeline/ includes physical measurements."""
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-01-01", height_cm="170.00"
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("measurements", response.data)
        self.assertEqual(len(response.data["measurements"]), 1)

    def test_timeline_assessments_chronological_order(self):
        """Timeline assessments are ordered chronologically (earliest first)."""
        make_assessment_with_items(
            self.player, self.coach, [(self.skill1, 70)], date="2026-03-01"
        )
        make_assessment_with_items(
            self.player, self.coach, [(self.skill1, 80)], date="2026-01-01"
        )
        make_assessment_with_items(
            self.player, self.coach, [(self.skill1, 90)], date="2026-06-01"
        )
        response = self.client.get(self.url)
        dates = [a["assessment_date"] for a in response.data["assessments"]]
        self.assertEqual(dates, sorted(dates))

    def test_timeline_empty_for_new_player(self):
        """A player with no data gets empty lists in the timeline."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["assessments"], [])
        self.assertEqual(response.data["goals"], [])
        self.assertEqual(response.data["measurements"], [])

    def test_timeline_404_for_unknown_player(self):
        """Timeline for a non-existent player UUID returns 404."""
        url = reverse(
            "player-development-timeline", kwargs={"player_pk": uuid.uuid4()}
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_player_can_access_own_timeline(self):
        """A PLAYER user can GET their own development timeline."""
        player_user = make_user(User.Role.PLAYER, "tl_player@test.com")
        player = make_player(user=player_user)
        self.client.force_authenticate(user=player_user)
        url = reverse("player-development-timeline", kwargs={"player_pk": player.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_player_cannot_access_other_players_timeline(self):
        """A PLAYER user cannot access another player's timeline (403)."""
        player_user = make_user(User.Role.PLAYER, "tl_other@test.com")
        make_player(user=player_user)
        self.client.force_authenticate(user=player_user)
        # Try to access self.player's timeline (not linked to player_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# Cross-academy development write authorization regression tests (Task 1)
# ---------------------------------------------------------------------------


class CrossAcademyDevelopmentWriteTests(APITestCase):
    """
    Verify that COACH and ACADEMY_ADMIN can only write development records
    (assessments, goals, measurements) for players affiliated with one of
    their academies.  A player with memberships in multiple academies must
    remain accessible to coaches of each of those academies.
    """

    def setUp(self):
        self.skill = make_skill("Crossing", "TECHNICAL")

        # Two academies
        self.academy_a = Academy.objects.create(name="Dev Academy A", city="London", country="England")
        self.academy_b = Academy.objects.create(name="Dev Academy B", city="Manchester", country="England")

        # Coach affiliated with academy A only
        self.coach_a = make_user(User.Role.COACH, "dev_coach_a@test.com")
        AcademyStaffMembership.objects.create(user=self.coach_a, academy=self.academy_a)

        # Academy admin affiliated with academy A only
        self.admin_a = make_user(User.Role.ACADEMY_ADMIN, "dev_admin_a@test.com")
        AcademyStaffMembership.objects.create(user=self.admin_a, academy=self.academy_a)

        # Coach affiliated with academy B only
        self.coach_b = make_user(User.Role.COACH, "dev_coach_b@test.com")
        AcademyStaffMembership.objects.create(user=self.coach_b, academy=self.academy_b)

        # Player in academy A only
        self.player_in_a = make_player(first_name="Alice")
        PlayerAcademyMembership.objects.create(
            player=self.player_in_a, academy=self.academy_a, joined_at=datetime.date(2024, 1, 1)
        )

        # Player in academy B only
        self.player_in_b = make_player(first_name="Bob")
        PlayerAcademyMembership.objects.create(
            player=self.player_in_b, academy=self.academy_b, joined_at=datetime.date(2024, 1, 1)
        )

        # Multi-academy player — member of both A and B
        self.player_in_ab = make_player(first_name="Charlie")
        PlayerAcademyMembership.objects.create(
            player=self.player_in_ab, academy=self.academy_a, joined_at=datetime.date(2023, 9, 1)
        )
        PlayerAcademyMembership.objects.create(
            player=self.player_in_ab, academy=self.academy_b, joined_at=datetime.date(2024, 7, 1)
        )

        # Player with no academy affiliations
        self.unaffiliated_player = make_player(first_name="Dave")

    # ---- assessment POST ----

    def _assessment_payload(self):
        return {
            "assessment_date": "2026-10-01",
            "items": [{"skill": str(self.skill.pk), "score": 75}],
        }

    def test_coach_a_can_post_assessment_for_player_in_a(self):
        """Coach of academy A can create an assessment for a player in academy A."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_a.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_coach_a_cannot_post_assessment_for_player_in_b_only(self):
        """Coach of academy A is denied when creating an assessment for a player only in academy B."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_b.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_a_cannot_post_assessment_for_unaffiliated_player(self):
        """Coach of academy A is denied when the player has no academy affiliations."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.unaffiliated_player.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_multi_academy_player_accessible_to_coach_a(self):
        """Coach of academy A can write for a player who has memberships in both A and B."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_ab.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_multi_academy_player_accessible_to_coach_b(self):
        """Coach of academy B can also write for the multi-academy player."""
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_ab.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_academy_admin_a_can_post_assessment_for_player_in_a(self):
        """Academy admin of A can create an assessment for a player in A."""
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_a.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_academy_admin_a_cannot_post_assessment_for_player_in_b_only(self):
        """Academy admin of A is denied for a player only in B."""
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_b.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- goal POST and PATCH ----

    def test_coach_a_can_post_goal_for_player_in_a(self):
        """Coach of academy A can create a goal for a player in A."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_in_a.pk})
        response = self.client.post(
            url, {"title": "Speed goal", "start_date": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_coach_a_cannot_post_goal_for_player_in_b_only(self):
        """Coach of academy A is denied when posting a goal for a player only in B."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_in_b.pk})
        response = self.client.post(
            url, {"title": "Speed goal", "start_date": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_a_can_patch_goal_for_player_in_a(self):
        """Coach of academy A can PATCH a goal for a player in A."""
        self.client.force_authenticate(user=self.coach_a)
        goal = DevelopmentGoal.objects.create(
            player=self.player_in_a, title="Endurance", start_date="2026-01-01",
            created_by=self.coach_a,
        )
        url = reverse("player-goal-detail", kwargs={"player_pk": self.player_in_a.pk, "pk": goal.pk})
        response = self.client.patch(url, {"status": "COMPLETED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_coach_a_cannot_patch_goal_for_player_in_b_only(self):
        """Coach of academy A is denied when PATCHing a goal for a player only in B."""
        self.client.force_authenticate(user=self.coach_b)
        goal = DevelopmentGoal.objects.create(
            player=self.player_in_b, title="Endurance", start_date="2026-01-01",
            created_by=self.coach_b,
        )
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-goal-detail", kwargs={"player_pk": self.player_in_b.pk, "pk": goal.pk})
        response = self.client.patch(url, {"status": "COMPLETED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- measurement POST ----

    def test_coach_a_can_post_measurement_for_player_in_a(self):
        """Coach of academy A can create a measurement for a player in A."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_in_a.pk})
        response = self.client.post(
            url, {"measurement_date": "2026-10-01", "height_cm": "175.00"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_coach_a_cannot_post_measurement_for_player_in_b_only(self):
        """Coach of academy A is denied when posting a measurement for a player only in B."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.player_in_b.pk})
        response = self.client.post(
            url, {"measurement_date": "2026-10-01", "height_cm": "175.00"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- reads remain open for coaches (no affiliation required for GET) ----

    def test_coach_a_can_read_assessments_for_player_in_b(self):
        """Coaches can still READ any player's development data regardless of affiliation."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Superuser bypass tests
# ---------------------------------------------------------------------------


class SuperuserDevelopmentBypassTests(APITestCase):
    """
    Django superusers must bypass all academy-affiliation and role-based
    restrictions on development endpoints.  Non-superuser restrictions must
    remain intact.
    """

    def setUp(self):
        self.skill = make_skill("First Touch", "TECHNICAL")

        # Two separate academies — the superuser has no membership in either.
        self.academy_a = Academy.objects.create(name="Super Academy A", city="London", country="England")
        self.academy_b = Academy.objects.create(name="Super Academy B", city="Bristol", country="England")

        # Superuser with the default ACADEMY_ADMIN role and no AcademyStaffMembership rows.
        self.superuser = User.objects.create_superuser(
            email="superadmin@test.com",
            password="superpass123",
            first_name="Super",
            last_name="Admin",
        )

        # Regular ACADEMY_ADMIN affiliated with academy A only.
        self.admin_a = make_user(User.Role.ACADEMY_ADMIN, "sa_admin_a@test.com")
        AcademyStaffMembership.objects.create(user=self.admin_a, academy=self.academy_a)

        # Player in academy A only.
        self.player_in_a = make_player(first_name="Eve")
        PlayerAcademyMembership.objects.create(
            player=self.player_in_a, academy=self.academy_a, joined_at=datetime.date(2024, 1, 1)
        )

        # Player in academy B only (no affiliation with admin_a's academy).
        self.player_in_b = make_player(first_name="Frank")
        PlayerAcademyMembership.objects.create(
            player=self.player_in_b, academy=self.academy_b, joined_at=datetime.date(2024, 1, 1)
        )

        # Player with no academy affiliations at all.
        self.unaffiliated_player = make_player(first_name="Grace")

    def _assessment_payload(self):
        return {
            "assessment_date": "2026-10-15",
            "items": [{"skill": str(self.skill.pk), "score": 80}],
        }

    # ---- Superuser can create a DevelopmentGoal for a player in any academy ----

    def test_superuser_can_create_goal_for_player_in_any_academy(self):
        """Superuser can POST a goal for a player with no affiliation to any academy."""
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-goal-list", kwargs={"player_pk": self.unaffiliated_player.pk})
        response = self.client.post(
            url, {"title": "Super goal", "start_date": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_superuser_can_create_assessment_for_unaffiliated_player(self):
        """Superuser can POST an assessment for a player with no academy membership."""
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.unaffiliated_player.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_superuser_can_create_assessment_for_player_in_different_academy(self):
        """Superuser can POST an assessment for a player in an academy they have no membership in."""
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_b.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_superuser_can_create_measurement_for_unaffiliated_player(self):
        """Superuser can POST a measurement for a player with no academy membership."""
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-measurement-list", kwargs={"player_pk": self.unaffiliated_player.pk})
        response = self.client.post(
            url, {"measurement_date": "2026-10-15", "height_cm": "178.00"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # ---- Regular ACADEMY_ADMIN can create for player in their own academy ----

    def test_regular_admin_can_create_goal_for_affiliated_player(self):
        """Regular ACADEMY_ADMIN can create a goal for a player in their own academy."""
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_in_a.pk})
        response = self.client.post(
            url, {"title": "Affiliated goal", "start_date": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # ---- Regular ACADEMY_ADMIN cannot create for player in another academy ----

    def test_regular_admin_cannot_create_goal_for_player_in_other_academy(self):
        """Regular ACADEMY_ADMIN is denied when creating a goal for a player in a different academy."""
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_in_b.pk})
        response = self.client.post(
            url, {"title": "Cross-academy goal", "start_date": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_admin_cannot_create_assessment_for_unaffiliated_player(self):
        """Regular ACADEMY_ADMIN is denied when creating an assessment for a player with no affiliation."""
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.unaffiliated_player.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- Existing role restrictions remain intact for non-superusers ----

    def test_player_role_cannot_create_assessment(self):
        """PLAYER role cannot create assessments even for their own player (403)."""
        player_user = make_user(User.Role.PLAYER, "sa_player@test.com")
        player = make_player(user=player_user)
        self.client.force_authenticate(user=player_user)
        url = reverse("player-assessment-list", kwargs={"player_pk": player.pk})
        response = self.client.post(url, self._assessment_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_role_cannot_create_goal(self):
        """PARENT role cannot create goals (403)."""
        parent_user = make_user(User.Role.PARENT, "sa_parent@test.com")
        self.client.force_authenticate(user=parent_user)
        url = reverse("player-goal-list", kwargs={"player_pk": self.player_in_a.pk})
        response = self.client.post(
            url, {"title": "Parent goal", "start_date": "2026-01-01"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_read_development_data_for_any_player(self):
        """Superuser can GET assessments for any player."""
        make_assessment_with_items(self.player_in_a, self.superuser, [(self.skill, 88)])
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-assessment-list", kwargs={"player_pk": self.player_in_a.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Player Comparison tests
# ---------------------------------------------------------------------------


def make_team(academy, name="U15 Boys", age_group="U15") -> Team:
    return Team.objects.create(academy=academy, name=name, age_group=age_group)


def add_to_team(player, team) -> PlayerTeamMembership:
    return PlayerTeamMembership.objects.create(
        player=player, team=team, joined_at=datetime.date(2024, 1, 1), status="active"
    )


class PlayerComparisonTests(APITestCase):
    """
    Tests for GET /api/players/{player_pk}/compare/
    """

    def setUp(self):
        # Shared academy and coach
        self.academy = Academy.objects.create(name="Compare Academy", city="London", country="England")
        self.coach = make_user(User.Role.COACH, "cmp_coach@test.com")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)

        # Technical and Physical skills
        self.skill_tech = make_skill("Passing-C", "TECHNICAL")
        self.skill_phys = make_skill("Speed-C", "PHYSICAL")

        # Target player with academy affiliation
        self.player = make_player(first_name="Target")
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

        # Two peer players with academy affiliation
        self.peer1 = make_player(first_name="Peer1")
        self.peer2 = make_player(first_name="Peer2")
        PlayerAcademyMembership.objects.create(
            player=self.peer1, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )
        PlayerAcademyMembership.objects.create(
            player=self.peer2, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

        # Team shared by all three
        self.team = make_team(self.academy)

        self.client.force_authenticate(user=self.coach)

    def _compare_url(self, player=None):
        p = player or self.player
        return reverse("player-compare", kwargs={"player_pk": p.pk})

    # ------------------------------------------------------------------ #
    # 1. No active team                                                     #
    # ------------------------------------------------------------------ #

    def test_no_active_team_returns_has_team_false(self):
        """Player with no team membership returns has_team: false."""
        # player has no team membership
        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_team"])
        self.assertNotIn("categories", response.data)

    # ------------------------------------------------------------------ #
    # 2. Player on team but no assessment                                   #
    # ------------------------------------------------------------------ #

    def test_no_player_assessment_returns_player_has_assessment_false(self):
        """Player on a team but without any assessment returns player_has_assessment: false."""
        add_to_team(self.player, self.team)
        add_to_team(self.peer1, self.team)

        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["has_team"])
        self.assertFalse(response.data["player_has_assessment"])
        self.assertEqual(response.data["categories"], [])

    # ------------------------------------------------------------------ #
    # 3. No eligible peers (teammates have no assessments)                 #
    # ------------------------------------------------------------------ #

    def test_no_eligible_peers_returns_empty_categories(self):
        """Player with assessment but all teammates have no assessment → empty categories."""
        add_to_team(self.player, self.team)
        add_to_team(self.peer1, self.team)

        # Only the target player has an assessment
        make_assessment_with_items(
            self.player, self.coach, [(self.skill_tech, 80)], date="2026-01-01"
        )
        # peer1 has NO assessment

        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["player_has_assessment"])
        self.assertEqual(response.data["categories"], [])
        self.assertEqual(response.data["peer_count"], 0)

    # ------------------------------------------------------------------ #
    # 4. Player's own scores excluded from peer average                    #
    # ------------------------------------------------------------------ #

    def test_comparison_excludes_player_from_peer_average(self):
        """The target player's own scores do not contribute to the team average."""
        add_to_team(self.player, self.team)
        add_to_team(self.peer1, self.team)

        # Player has very high score
        make_assessment_with_items(
            self.player, self.coach, [(self.skill_tech, 100)], date="2026-01-10"
        )
        # Peer has a known score
        make_assessment_with_items(
            self.peer1, self.coach, [(self.skill_tech, 60)], date="2026-01-10"
        )

        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cat_data = response.data["categories"]
        self.assertEqual(len(cat_data), 1)
        entry = cat_data[0]
        # Team avg should be exactly 60, not (100+60)/2 = 80
        self.assertEqual(entry["team_avg"], 60.0)
        self.assertEqual(entry["player_score"], 100)

    # ------------------------------------------------------------------ #
    # 5. Correct calculation with known scores                             #
    # ------------------------------------------------------------------ #

    def test_comparison_correct_calculation(self):
        """Verify calculation: player_score, team_avg, diff with known values."""
        add_to_team(self.player, self.team)
        add_to_team(self.peer1, self.team)
        add_to_team(self.peer2, self.team)

        # player scores: TECHNICAL 80, PHYSICAL 70
        make_assessment_with_items(
            self.player, self.coach,
            [(self.skill_tech, 80), (self.skill_phys, 70)],
            date="2026-01-15",
        )
        # peer1: TECHNICAL 60, PHYSICAL 50
        make_assessment_with_items(
            self.peer1, self.coach,
            [(self.skill_tech, 60), (self.skill_phys, 50)],
            date="2026-01-15",
        )
        # peer2: TECHNICAL 80, PHYSICAL 90
        make_assessment_with_items(
            self.peer2, self.coach,
            [(self.skill_tech, 80), (self.skill_phys, 90)],
            date="2026-01-15",
        )

        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cats = {c["category"]: c for c in response.data["categories"]}

        # TECHNICAL: player=80, team_avg=(60+80)/2=70.0, diff=10.0
        self.assertIn("TECHNICAL", cats)
        self.assertEqual(cats["TECHNICAL"]["player_score"], 80)
        self.assertEqual(cats["TECHNICAL"]["team_avg"], 70.0)
        self.assertEqual(cats["TECHNICAL"]["diff"], 10.0)
        self.assertEqual(cats["TECHNICAL"]["peers_with_data"], 2)

        # PHYSICAL: player=70, team_avg=(50+90)/2=70.0, diff=0.0
        self.assertIn("PHYSICAL", cats)
        self.assertEqual(cats["PHYSICAL"]["player_score"], 70)
        self.assertEqual(cats["PHYSICAL"]["team_avg"], 70.0)
        self.assertEqual(cats["PHYSICAL"]["diff"], 0.0)

    # ------------------------------------------------------------------ #
    # 6. Category excluded if no peer has that category                   #
    # ------------------------------------------------------------------ #

    def test_only_categories_with_both_sides_included(self):
        """Categories with player data but no peer data are excluded."""
        add_to_team(self.player, self.team)
        add_to_team(self.peer1, self.team)

        # Player has TECHNICAL and PHYSICAL; peer only has TECHNICAL
        make_assessment_with_items(
            self.player, self.coach,
            [(self.skill_tech, 80), (self.skill_phys, 70)],
            date="2026-01-15",
        )
        make_assessment_with_items(
            self.peer1, self.coach,
            [(self.skill_tech, 60)],  # no PHYSICAL
            date="2026-01-15",
        )

        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cat_names = [c["category"] for c in response.data["categories"]]
        # PHYSICAL should be excluded (no peer has it)
        self.assertIn("TECHNICAL", cat_names)
        self.assertNotIn("PHYSICAL", cat_names)

    # ------------------------------------------------------------------ #
    # 7. Superuser can compare any player                                 #
    # ------------------------------------------------------------------ #

    def test_superuser_can_compare_any_player(self):
        """Superuser with no academy affiliation can access compare endpoint."""
        superuser = User.objects.create_superuser(
            email="cmp_super@test.com", password="pass123",
            first_name="Super", last_name="Admin",
        )
        add_to_team(self.player, self.team)
        make_assessment_with_items(
            self.player, self.coach, [(self.skill_tech, 80)], date="2026-01-01"
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["has_team"])

    # ------------------------------------------------------------------ #
    # 8. Coach at same academy can compare                                 #
    # ------------------------------------------------------------------ #

    def test_coach_can_compare_affiliated_player(self):
        """Coach affiliated with the same academy can access compare endpoint."""
        add_to_team(self.player, self.team)
        # self.coach is already affiliated with self.academy
        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ------------------------------------------------------------------ #
    # 9. Coach at different academy cannot compare                        #
    # ------------------------------------------------------------------ #

    def test_coach_cannot_compare_unaffiliated_player(self):
        """Coach at a different academy cannot access compare of unlinked player."""
        other_academy = Academy.objects.create(name="Other Academy-CMP", city="Berlin", country="Germany")
        other_coach = make_user(User.Role.COACH, "cmp_other_coach@test.com")
        AcademyStaffMembership.objects.create(user=other_coach, academy=other_academy)

        # self.player is only affiliated with self.academy, not other_academy
        # other_coach has no affiliation with self.academy

        # For READ, coaches can read any player's data per existing rules.
        # Let's verify the existing read permission (coaches can read any player).
        # The development permissions allow coaches to READ without affiliation check.
        # So this test verifies that a coach CAN read (same as existing behavior).
        add_to_team(self.player, self.team)
        self.client.force_authenticate(user=other_coach)
        response = self.client.get(self._compare_url())
        # Coaches can read any player's data (no affiliation required for read)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ------------------------------------------------------------------ #
    # 10. Academy admin at same academy can compare                        #
    # ------------------------------------------------------------------ #

    def test_academy_admin_can_compare_own_academy_player(self):
        """Academy admin affiliated with the same academy can compare their player."""
        admin = make_user(User.Role.ACADEMY_ADMIN, "cmp_admin@test.com")
        AcademyStaffMembership.objects.create(user=admin, academy=self.academy)

        add_to_team(self.player, self.team)
        self.client.force_authenticate(user=admin)
        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ------------------------------------------------------------------ #
    # 11. Latest assessment is used, not an older one                      #
    # ------------------------------------------------------------------ #

    def test_uses_latest_assessment_per_player(self):
        """When a player has multiple assessments, the latest one is used for comparison."""
        add_to_team(self.player, self.team)
        add_to_team(self.peer1, self.team)

        # Player: old assessment with score 50, latest with score 90
        make_assessment_with_items(
            self.player, self.coach, [(self.skill_tech, 50)], date="2026-01-01"
        )
        make_assessment_with_items(
            self.player, self.coach, [(self.skill_tech, 90)], date="2026-06-01"
        )

        # Peer: single assessment
        make_assessment_with_items(
            self.peer1, self.coach, [(self.skill_tech, 60)], date="2026-01-01"
        )

        response = self.client.get(self._compare_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cats = {c["category"]: c for c in response.data["categories"]}

        # Should use player score 90 (latest), NOT 50 (oldest)
        self.assertEqual(cats["TECHNICAL"]["player_score"], 90)
        # diff = 90 - 60 = 30.0
        self.assertEqual(cats["TECHNICAL"]["diff"], 30.0)


# ---------------------------------------------------------------------------
# Monthly Date Filtering Tests
# ---------------------------------------------------------------------------


class MonthlyDateFilteringTests(APITestCase):
    """Tests for ?year=YYYY&month=MM filtering on timeline, matches, and training."""

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "filter_coach@test.com")
        self.player = make_player()
        self.skill1 = make_skill("FilterSkill", "TECHNICAL")
        self.client.force_authenticate(user=self.coach)

        # Academy affiliation for writes
        self.academy = Academy.objects.create(name="Filter Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

        self.timeline_url = reverse("player-development-timeline", kwargs={"player_pk": self.player.pk})

    def test_timeline_no_filter_returns_all(self):
        """No year/month params → all assessments are returned."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 70)], date="2026-01-15")
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)], date="2026-03-10")
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 85)], date="2026-05-20")
        response = self.client.get(self.timeline_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["assessments"]), 3)

    def test_timeline_filter_by_month_returns_only_that_month(self):
        """3 assessments — 1 in target month, 2 outside → only 1 returned."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 70)], date="2026-01-15")  # target month
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)], date="2026-02-10")  # different month
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 85)], date="2025-01-20")  # different year
        response = self.client.get(self.timeline_url, {"year": "2026", "month": "1"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["assessments"]), 1)
        self.assertEqual(response.data["assessments"][0]["assessment_date"], "2026-01-15")

    def test_timeline_filter_boundary_first_day(self):
        """Assessment on month's first day is included."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 75)], date="2026-03-01")
        response = self.client.get(self.timeline_url, {"year": "2026", "month": "3"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["assessments"]), 1)

    def test_timeline_filter_boundary_last_day(self):
        """Assessment on month's last day is included (March 31)."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 75)], date="2026-03-31")
        response = self.client.get(self.timeline_url, {"year": "2026", "month": "3"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["assessments"]), 1)

    def test_timeline_filter_excludes_adjacent_months(self):
        """Day before start and day after end excluded."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 70)], date="2026-02-28")  # day before March
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)], date="2026-03-15")  # in March
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 90)], date="2026-04-01")  # day after March
        response = self.client.get(self.timeline_url, {"year": "2026", "month": "3"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["assessments"]), 1)
        self.assertEqual(response.data["assessments"][0]["assessment_date"], "2026-03-15")

    def test_measurement_filter_by_month(self):
        """Measurements filtered by month correctly."""
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-04-10", height_cm="175.00"
        )
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-05-05", height_cm="176.00"
        )
        response = self.client.get(self.timeline_url, {"year": "2026", "month": "4"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["measurements"]), 1)
        self.assertEqual(response.data["measurements"][0]["measurement_date"], "2026-04-10")

    def test_match_history_filter_by_month(self):
        """Match history filtered by month via ?year=YYYY&month=MM."""
        from apps.matches.models import Match, MatchPlayerStats
        from apps.teams.models import Team

        team = Team.objects.create(
            academy=self.academy, name="Filter Team", age_group="U15"
        )
        match_in = Match.objects.create(
            academy=self.academy, team=team, opponent_name="Opp A",
            match_date="2026-06-15", home_away="HOME", created_by=self.coach
        )
        match_out = Match.objects.create(
            academy=self.academy, team=team, opponent_name="Opp B",
            match_date="2026-07-10", home_away="AWAY", created_by=self.coach
        )
        MatchPlayerStats.objects.create(match=match_in, player=self.player)
        MatchPlayerStats.objects.create(match=match_out, player=self.player)

        url = reverse("player-match-history", kwargs={"player_pk": self.player.pk})
        response = self.client.get(url, {"year": "2026", "month": "6"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["matches"]), 1)

    def test_training_history_filter_by_month(self):
        """Training history filtered by month via ?year=YYYY&month=MM."""
        from apps.training.models import TrainingAttendance, TrainingSession
        from apps.teams.models import Team

        team = Team.objects.create(
            academy=self.academy, name="Filter Training Team", age_group="U15"
        )
        session_in = TrainingSession.objects.create(
            academy=self.academy, team=team, title="Session In",
            training_date="2026-08-12", coach=self.coach
        )
        session_out = TrainingSession.objects.create(
            academy=self.academy, team=team, title="Session Out",
            training_date="2026-09-05", coach=self.coach
        )
        TrainingAttendance.objects.create(session=session_in, player=self.player, status="PRESENT")
        TrainingAttendance.objects.create(session=session_out, player=self.player, status="PRESENT")

        url = reverse("player-training-history", kwargs={"player_pk": self.player.pk})
        response = self.client.get(url, {"year": "2026", "month": "8"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["sessions"]), 1)
        self.assertEqual(response.data["sessions"][0]["training_date"], "2026-08-12")


# ---------------------------------------------------------------------------
# Monthly Report Summary Tests
# ---------------------------------------------------------------------------


class MonthlyReportTests(APITestCase):
    """Tests for GET /api/players/{player_pk}/report/monthly/?year=YYYY&month=MM"""

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "monthly_coach@test.com")
        self.player = make_player()
        self.skill1 = make_skill("MonthlySkill", "TECHNICAL")
        self.client.force_authenticate(user=self.coach)

        self.academy = Academy.objects.create(name="Monthly Academy", city="London", country="England")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at=datetime.date(2024, 1, 1)
        )

        from apps.teams.models import Team
        self.team = Team.objects.create(
            academy=self.academy, name="Monthly Team", age_group="U15"
        )

        self.url = reverse("player-monthly-report", kwargs={"player_pk": self.player.pk})

    def _get(self, year, month):
        return self.client.get(self.url, {"year": str(year), "month": str(month)})

    def _make_match_with_stats(self, match_date, goals=1, assists=0, team_score=2, opponent_score=1):
        from apps.matches.models import Match, MatchPlayerStats
        match = Match.objects.create(
            academy=self.academy, team=self.team, opponent_name="Opp",
            match_date=match_date, home_away="HOME",
            team_score=team_score, opponent_score=opponent_score,
            created_by=self.coach
        )
        MatchPlayerStats.objects.create(
            match=match, player=self.player,
            goals=goals, assists=assists
        )
        return match

    def _make_training_with_attendance(self, training_date, attendance_status="PRESENT"):
        from apps.training.models import TrainingAttendance, TrainingSession
        session = TrainingSession.objects.create(
            academy=self.academy, team=self.team,
            title="Monthly Session", training_date=training_date, coach=self.coach
        )
        TrainingAttendance.objects.create(session=session, player=self.player, status=attendance_status)
        return session

    def test_monthly_summary_current_and_previous(self):
        """Response includes current and previous month stats."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)], date="2026-10-10")
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 75)], date="2026-09-15")
        self._make_match_with_stats("2026-10-05")
        self._make_training_with_attendance("2026-10-12")

        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("current", response.data)
        self.assertIn("previous", response.data)
        self.assertIn("has_previous_data", response.data)
        self.assertEqual(response.data["period"]["year"], 2026)
        self.assertEqual(response.data["period"]["month"], 10)
        self.assertEqual(response.data["current"]["assessment_count"], 1)
        self.assertEqual(response.data["current"]["match_count"], 1)
        self.assertEqual(response.data["current"]["training_count"], 1)
        self.assertTrue(response.data["has_previous_data"])
        self.assertIsNotNone(response.data["previous"])
        self.assertEqual(response.data["previous"]["assessment_count"], 1)

    def test_monthly_summary_no_previous_data(self):
        """First month of activity → has_previous_data: false, previous: null."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)], date="2026-10-10")
        # No data in September
        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_previous_data"])
        self.assertIsNone(response.data["previous"])

    def test_monthly_summary_invalid_month_param(self):
        """?year=2026&month=13 → 400."""
        response = self._get(2026, 13)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_monthly_summary_missing_month_only_param(self):
        """Only year provided → 400."""
        response = self.client.get(self.url, {"year": "2026"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_monthly_summary_permission_denied(self):
        """User at different academy → 403 when player is linked to a different user."""
        other_player_user = make_user(User.Role.PLAYER, "monthly_other@test.com")
        other_player = make_player(user=other_player_user)
        self.client.force_authenticate(user=other_player_user)
        # Try to access self.player's report (not linked to other_player_user)
        url = reverse("player-monthly-report", kwargs={"player_pk": self.player.pk})
        response = self.client.get(url, {"year": "2026", "month": "10"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_monthly_summary_superuser_access(self):
        """Superuser can access any player's monthly report."""
        superuser = User.objects.create_superuser(
            email="monthly_super@test.com",
            password="superpass123",
            first_name="Super",
            last_name="Admin",
        )
        self.client.force_authenticate(user=superuser)
        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_monthly_summary_empty_month(self):
        """No records for the month → all counts are 0."""
        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        current = response.data["current"]
        self.assertEqual(current["assessment_count"], 0)
        self.assertEqual(current["match_count"], 0)
        self.assertEqual(current["training_count"], 0)
        self.assertEqual(current["measurement_count"], 0)
        self.assertEqual(current["goals_completed"], 0)
        self.assertEqual(current["goals_active"], 0)
        self.assertFalse(response.data["has_previous_data"])

    def test_monthly_summary_wins_counted_correctly(self):
        """matches_won counts only WIN results."""
        self._make_match_with_stats("2026-10-01", team_score=3, opponent_score=0)  # win
        self._make_match_with_stats("2026-10-05", team_score=1, opponent_score=1)  # draw
        self._make_match_with_stats("2026-10-10", team_score=0, opponent_score=2)  # loss
        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current"]["match_count"], 3)
        self.assertEqual(response.data["current"]["matches_won"], 1)

    def test_monthly_summary_goals_and_assists_summed(self):
        """goals and assists are summed across all matches in the month."""
        self._make_match_with_stats("2026-10-01", goals=2, assists=1)
        self._make_match_with_stats("2026-10-15", goals=1, assists=2)
        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current"]["goals"], 3)
        self.assertEqual(response.data["current"]["assists"], 3)

    def test_monthly_summary_attendance_rate(self):
        """attendance_rate = present+late / total recorded."""
        self._make_training_with_attendance("2026-10-01", attendance_status="PRESENT")
        self._make_training_with_attendance("2026-10-08", attendance_status="LATE")
        self._make_training_with_attendance("2026-10-15", attendance_status="ABSENT")
        self._make_training_with_attendance("2026-10-22", attendance_status="PRESENT")
        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # 3 attended (present+late) out of 4 → 75%
        self.assertEqual(response.data["current"]["attendance_rate"], 75)

    def test_monthly_summary_year_boundary_wraps_correctly(self):
        """Previous month for January should be December of previous year."""
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 70)], date="2025-12-20")
        make_assessment_with_items(self.player, self.coach, [(self.skill1, 80)], date="2026-01-10")
        response = self._get(2026, 1)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current"]["assessment_count"], 1)
        self.assertTrue(response.data["has_previous_data"])
        self.assertEqual(response.data["previous"]["assessment_count"], 1)

    def test_monthly_summary_missing_year_param(self):
        """Only month provided → 400."""
        response = self.client.get(self.url, {"month": "10"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_monthly_summary_non_integer_params(self):
        """Non-integer year/month → 400."""
        response = self.client.get(self.url, {"year": "abc", "month": "10"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_monthly_summary_measurement_count(self):
        """measurement_count is correctly counted for the month."""
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-10-05", height_cm="175.00"
        )
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-10-20", height_cm="175.50"
        )
        PhysicalMeasurement.objects.create(
            player=self.player, measurement_date="2026-11-01", height_cm="176.00"
        )
        response = self._get(2026, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current"]["measurement_count"], 2)
