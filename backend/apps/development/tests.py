import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.players.models import Player
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
