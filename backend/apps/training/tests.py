import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.development.models import Skill
from apps.players.models import Player
from apps.teams.models import Team
from apps.users.models import User

from .models import Exercise, TrainingAttendance, TrainingSession, TrainingSessionExercise


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


def make_skill(name="Passing", category="TECHNICAL") -> Skill:
    return Skill.objects.get_or_create(name=name, defaults={"category": category})[0]


def make_exercise(coach: User, name="5v2 Rondo", category="TECHNICAL") -> Exercise:
    return Exercise.objects.create(
        name=name,
        category=category,
        description="A possession exercise.",
        created_by=coach,
    )


def make_session(
    coach: User,
    academy: Academy,
    team: Team = None,
    title="Wednesday Session",
    training_date="2026-10-08",
) -> TrainingSession:
    return TrainingSession.objects.create(
        academy=academy,
        team=team,
        title=title,
        training_date=training_date,
        coach=coach,
    )


# ---------------------------------------------------------------------------
# 1–5. Training Session API tests
# ---------------------------------------------------------------------------


class TrainingSessionAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "coach@training.test")
        self.academy = make_academy()
        self.team = make_team(self.academy)
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        self.client.force_authenticate(user=self.coach)
        self.list_url = reverse("training-session-list")

    def _payload(self, **overrides):
        base = {
            "academy": str(self.academy.pk),
            "title": "Speed & Passing Session",
            "training_date": "2026-10-08",
        }
        return {**base, **overrides}

    def test_create_session(self):
        """POST /api/training/sessions/ creates a session and returns 201."""
        response = self.client.post(self.list_url, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Speed & Passing Session")
        self.assertEqual(str(response.data["academy"]), str(self.academy.pk))

    def test_retrieve_session(self):
        """GET /api/training/sessions/{id}/ returns the correct session."""
        session = make_session(self.coach, self.academy)
        url = reverse("training-session-detail", kwargs={"pk": session.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(session.pk))

    def test_update_session(self):
        """PATCH /api/training/sessions/{id}/ updates allowed fields."""
        session = make_session(self.coach, self.academy)
        url = reverse("training-session-detail", kwargs={"pk": session.pk})
        response = self.client.patch(url, {"location": "Main Pitch"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["location"], "Main Pitch")

    def test_session_belongs_to_academy(self):
        """Created session references the correct academy."""
        response = self.client.post(self.list_url, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data["academy"]), str(self.academy.pk))
        self.assertEqual(response.data["academy_name"], self.academy.name)

    def test_team_must_belong_to_academy(self):
        """Session with a team from a different academy is rejected (400)."""
        other_academy = make_academy(name="Other Academy")
        other_team = make_team(other_academy, name="U12 Boys")
        payload = self._payload(team=str(other_team.pk))
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("team", str(response.data))

    def test_session_with_focus_skills(self):
        """Creating a session with focus_skills stores them correctly."""
        skill1 = make_skill("Passing", "TECHNICAL")
        skill2 = make_skill("Speed", "PHYSICAL")
        payload = self._payload(focus_skills=[str(skill1.pk), str(skill2.pk)])
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        skill_ids = [str(s["id"]) for s in response.data["focus_skills"]]
        self.assertIn(str(skill1.pk), skill_ids)
        self.assertIn(str(skill2.pk), skill_ids)

    def test_session_list(self):
        """GET /api/training/sessions/ returns sessions."""
        make_session(self.coach, self.academy)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if isinstance(response.data, dict) and "results" in response.data else response.data
        self.assertGreaterEqual(len(results), 1)


# ---------------------------------------------------------------------------
# 6–9. Exercise API tests
# ---------------------------------------------------------------------------


class ExerciseAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "ecoach@training.test")
        self.client.force_authenticate(user=self.coach)
        self.list_url = reverse("exercise-list")

    def _payload(self, **overrides):
        base = {
            "name": "5v2 Rondo",
            "description": "Possession drill.",
            "category": "TECHNICAL",
            "duration_minutes": 15,
        }
        return {**base, **overrides}

    def test_create_exercise(self):
        """POST /api/training/exercises/ creates an exercise and returns 201."""
        response = self.client.post(self.list_url, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "5v2 Rondo")
        self.assertEqual(response.data["category"], "TECHNICAL")

    def test_retrieve_exercise(self):
        """GET /api/training/exercises/{id}/ returns the correct exercise."""
        exercise = make_exercise(self.coach)
        url = reverse("exercise-detail", kwargs={"pk": exercise.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(exercise.pk))

    def test_update_exercise(self):
        """PATCH /api/training/exercises/{id}/ updates the exercise."""
        exercise = make_exercise(self.coach)
        url = reverse("exercise-detail", kwargs={"pk": exercise.pk})
        response = self.client.patch(
            url, {"description": "Updated description."}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["description"], "Updated description.")

    def test_exercise_can_be_reused(self):
        """The same exercise can be added to multiple training sessions."""
        academy = make_academy()
        exercise = make_exercise(self.coach, name="Sprint Circuit")
        session1 = make_session(self.coach, academy, title="Session A", training_date="2026-10-01")
        session2 = make_session(self.coach, academy, title="Session B", training_date="2026-10-08")
        TrainingSessionExercise.objects.create(session=session1, exercise=exercise, order=1)
        TrainingSessionExercise.objects.create(session=session2, exercise=exercise, order=1)
        self.assertEqual(exercise.session_exercises.count(), 2)


# ---------------------------------------------------------------------------
# Exercise ownership tests
# ---------------------------------------------------------------------------


class ExerciseOwnershipTests(APITestCase):
    """
    Verify that PATCH /api/training/exercises/{id}/ is restricted to the
    exercise's creator.  Any other COACH or ACADEMY_ADMIN receives 403.
    PLAYER and PARENT are blocked by the existing role check before the
    ownership check is even reached.
    """

    def setUp(self):
        self.creator = make_user(User.Role.COACH, "owner@exercise.test")
        self.other_coach = make_user(User.Role.COACH, "other@exercise.test")
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "admin@exercise.test")
        self.player_user = make_user(User.Role.PLAYER, "player@exercise.test")
        self.parent_user = make_user(User.Role.PARENT, "parent@exercise.test")
        # Exercise created by self.creator
        self.exercise = make_exercise(self.creator, name="Ownership Drill")
        self.detail_url = reverse("exercise-detail", kwargs={"pk": self.exercise.pk})

    # ---- creator ----

    def test_creator_can_update_own_exercise(self):
        """Creator can PATCH their own exercise (200)."""
        self.client.force_authenticate(user=self.creator)
        response = self.client.patch(
            self.detail_url, {"description": "Updated by creator."}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["description"], "Updated by creator.")

    def test_creator_update_preserves_created_by(self):
        """created_by is read-only; the creator field does not change on PATCH."""
        self.client.force_authenticate(user=self.creator)
        # Attempt to supply a different created_by — should be silently ignored.
        response = self.client.patch(
            self.detail_url,
            {"created_by": str(self.other_coach.pk), "name": "Renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["created_by"]), str(self.creator.pk))

    # ---- other coaches ----

    def test_other_coach_cannot_update_exercise(self):
        """A different COACH receives 403 when PATCHing another coach's exercise."""
        self.client.force_authenticate(user=self.other_coach)
        response = self.client.patch(
            self.detail_url, {"description": "Tampered."}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_other_coach_cannot_deactivate_exercise(self):
        """A different COACH cannot set is_active=False on another user's exercise."""
        self.client.force_authenticate(user=self.other_coach)
        response = self.client.patch(
            self.detail_url, {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.exercise.refresh_from_db()
        self.assertTrue(self.exercise.is_active)

    # ---- academy admin ----

    def test_academy_admin_cannot_update_another_users_exercise(self):
        """ACADEMY_ADMIN receives 403 when PATCHing an exercise they did not create."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            self.detail_url, {"name": "Admin Override"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_academy_admin_can_update_own_exercise(self):
        """ACADEMY_ADMIN can PATCH an exercise they personally created."""
        own_exercise = make_exercise(self.admin, name="Admin Exercise")
        url = reverse("exercise-detail", kwargs={"pk": own_exercise.pk})
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(url, {"description": "Admin edit."}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["description"], "Admin edit.")

    # ---- other roles ----

    def test_player_cannot_update_exercise(self):
        """PLAYER role is blocked by the existing role check (403)."""
        self.client.force_authenticate(user=self.player_user)
        response = self.client.patch(
            self.detail_url, {"description": "Player attempt."}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_update_exercise(self):
        """PARENT role is blocked by the existing role check (403)."""
        self.client.force_authenticate(user=self.parent_user)
        response = self.client.patch(
            self.detail_url, {"description": "Parent attempt."}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- reads are unaffected ----

    def test_other_coach_can_read_any_exercise(self):
        """A different COACH can still GET any exercise from the global library (200)."""
        self.client.force_authenticate(user=self.other_coach)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(self.exercise.pk))

    def test_exercise_list_unaffected_by_ownership(self):
        """GET /api/training/exercises/ returns all exercises regardless of creator."""
        extra = make_exercise(self.other_coach, name="Other Coach Drill")
        self.client.force_authenticate(user=self.creator)
        url = reverse("exercise-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        ids = [str(r["id"]) for r in results]
        self.assertIn(str(self.exercise.pk), ids)
        self.assertIn(str(extra.pk), ids)


# ---------------------------------------------------------------------------
# 10–11. Session Exercise API tests
# ---------------------------------------------------------------------------


class SessionExerciseAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "secoach@training.test")
        self.academy = make_academy()
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        self.session = make_session(self.coach, self.academy)
        self.exercise1 = make_exercise(self.coach, name="Rondo")
        self.exercise2 = make_exercise(self.coach, name="Sprint Drill", category="PHYSICAL")
        self.client.force_authenticate(user=self.coach)
        self.url = reverse(
            "training-session-exercise-list",
            kwargs={"session_pk": self.session.pk},
        )

    def test_add_exercise_to_session(self):
        """POST .../exercises/ adds an exercise to the session and returns 201."""
        payload = {"exercise": str(self.exercise1.pk), "order": 1}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["exercise_name"], "Rondo")
        self.assertEqual(response.data["order"], 1)

    def test_exercise_ordering(self):
        """Exercises in a session are returned ordered by the order field."""
        TrainingSessionExercise.objects.create(
            session=self.session, exercise=self.exercise2, order=1
        )
        TrainingSessionExercise.objects.create(
            session=self.session, exercise=self.exercise1, order=2
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        orders = [e["order"] for e in response.data]
        self.assertEqual(orders, sorted(orders))


# ---------------------------------------------------------------------------
# 12–15. Attendance API tests
# ---------------------------------------------------------------------------


class AttendanceAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "attcoach@training.test")
        self.academy = make_academy()
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        self.session = make_session(self.coach, self.academy)
        self.player = make_player()
        # Player must be affiliated with the session's academy (Task 2 security fix).
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2024-01-01"
        )
        self.client.force_authenticate(user=self.coach)
        self.list_url = reverse(
            "training-attendance-list",
            kwargs={"session_pk": self.session.pk},
        )

    def test_record_attendance(self):
        """POST .../attendance/ records attendance and returns 201."""
        payload = {"player": str(self.player.pk), "status": "PRESENT"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "PRESENT")
        self.assertEqual(str(response.data["player"]), str(self.player.pk))

    def test_update_attendance(self):
        """PATCH .../attendance/{id}/ updates the status."""
        attendance = TrainingAttendance.objects.create(
            session=self.session, player=self.player, status="PRESENT"
        )
        url = reverse(
            "training-attendance-detail",
            kwargs={"session_pk": self.session.pk, "pk": attendance.pk},
        )
        response = self.client.patch(url, {"status": "LATE", "notes": "10 min late"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "LATE")
        self.assertEqual(response.data["notes"], "10 min late")

    def test_duplicate_attendance_rejected(self):
        """Recording attendance twice for the same player/session returns 400."""
        TrainingAttendance.objects.create(
            session=self.session, player=self.player, status="PRESENT"
        )
        payload = {"player": str(self.player.pk), "status": "ABSENT"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_status_rejected(self):
        """An unknown attendance status returns 400."""
        payload = {"player": str(self.player.pk), "status": "MAYBE"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_attendance_list(self):
        """GET .../attendance/ returns all attendance records for the session."""
        player2 = make_player(first_name="Jane", last_name="Smith")
        TrainingAttendance.objects.create(
            session=self.session, player=self.player, status="PRESENT"
        )
        TrainingAttendance.objects.create(
            session=self.session, player=player2, status="ABSENT"
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)


# ---------------------------------------------------------------------------
# 16–20. Permission tests
# ---------------------------------------------------------------------------


class TrainingPermissionTests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "permcoach@training.test")
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "admin@training.test")
        self.player_user = make_user(User.Role.PLAYER, "player@training.test")
        self.player = make_player(user=self.player_user)
        self.academy = make_academy()
        self.session_list_url = reverse("training-session-list")
        self.exercise_list_url = reverse("exercise-list")

    def _session_payload(self):
        return {
            "academy": str(self.academy.pk),
            "title": "Test Session",
            "training_date": "2026-10-08",
        }

    def test_coach_can_create_training(self):
        """A COACH with staff membership can POST a training session (201)."""
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        self.client.force_authenticate(user=self.coach)
        response = self.client.post(
            self.session_list_url, self._session_payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_academy_admin_can_manage_training(self):
        """ACADEMY_ADMIN with staff membership can create and list training sessions."""
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy)
        self.client.force_authenticate(user=self.admin)
        # Create
        response = self.client.post(
            self.session_list_url, self._session_payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # List
        response = self.client.get(self.session_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_player_cannot_access_session_list(self):
        """A PLAYER cannot access the general training session list (403)."""
        self.client.force_authenticate(user=self.player_user)
        response = self.client.get(self.session_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_player_cannot_view_another_players_history(self):
        """A PLAYER cannot view another player's training history (404)."""
        other_player_user = make_user(User.Role.PLAYER, "other@training.test")
        other_player = make_player(user=other_player_user)
        self.client.force_authenticate(user=self.player_user)
        url = reverse("player-training-history", kwargs={"player_pk": other_player.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_returns_401(self):
        """Unauthenticated requests to training endpoints return 401."""
        response = self.client.get(self.session_list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_player_cannot_create_exercise(self):
        """A PLAYER cannot create exercises (403)."""
        self.client.force_authenticate(user=self.player_user)
        payload = {"name": "My Exercise", "category": "TECHNICAL"}
        response = self.client.post(self.exercise_list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# 21–23. Player Training History tests
# ---------------------------------------------------------------------------


class PlayerTrainingHistoryTests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "histcoach@training.test")
        self.player_user = make_user(User.Role.PLAYER, "histplayer@training.test")
        self.player = make_player(user=self.player_user)
        self.academy = make_academy()
        # Coach must be a staff member so the academy-scoped filter returns sessions.
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        # Player must be enrolled in the academy so get_player_and_check_training_access
        # can verify the coach's visibility of this player (returns 404 otherwise).
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy, joined_at="2026-01-01"
        )
        self.client.force_authenticate(user=self.coach)
        self.url = reverse(
            "player-training-history", kwargs={"player_pk": self.player.pk}
        )

    def test_history_returns_sessions(self):
        """GET /api/players/{id}/training/history/ returns attended sessions."""
        session = make_session(self.coach, self.academy)
        TrainingAttendance.objects.create(
            session=session, player=self.player, status="PRESENT"
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("sessions", response.data)
        self.assertEqual(len(response.data["sessions"]), 1)
        self.assertEqual(response.data["sessions"][0]["title"], session.title)

    def test_attendance_appears_correctly(self):
        """Attendance status is embedded in each session entry."""
        session = make_session(self.coach, self.academy)
        TrainingAttendance.objects.create(
            session=session, player=self.player, status="LATE", notes="Bus delay"
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry = response.data["sessions"][0]
        self.assertEqual(entry["attendance_status"], "LATE")
        self.assertEqual(entry["attendance_notes"], "Bus delay")

    def test_focus_skills_appear_correctly(self):
        """Focus skills are included in the training history response."""
        skill = make_skill("First Touch", "TECHNICAL")
        session = make_session(self.coach, self.academy)
        session.focus_skills.add(skill)
        TrainingAttendance.objects.create(
            session=session, player=self.player, status="PRESENT"
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        focus_names = [s["name"] for s in response.data["sessions"][0]["focus_skills"]]
        self.assertIn("First Touch", focus_names)

    def test_player_can_view_own_history(self):
        """A PLAYER user can GET their own training history (200)."""
        session = make_session(self.coach, self.academy)
        TrainingAttendance.objects.create(
            session=session, player=self.player, status="PRESENT"
        )
        self.client.force_authenticate(user=self.player_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_empty_history_for_player_with_no_attendance(self):
        """A player with no attendance records gets an empty sessions list."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["sessions"], [])

    def test_sessions_excluded_if_no_attendance(self):
        """Sessions without attendance for the player do not appear in history."""
        # Create a session but don't add attendance for this player
        make_session(self.coach, self.academy)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["sessions"]), 0)

    def test_history_404_for_unknown_player(self):
        """History for a non-existent player UUID returns 404."""
        url = reverse("player-training-history", kwargs={"player_pk": uuid.uuid4()})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# ?coach=me filter tests
# ---------------------------------------------------------------------------


class TrainingSessionCoachMeFilterTests(APITestCase):

    def setUp(self):
        self.coach_a = make_user(User.Role.COACH, "coach_a@training.test")
        self.coach_b = make_user(User.Role.COACH, "coach_b@training.test")
        self.academy = make_academy(name="Filter Test Academy")
        AcademyStaffMembership.objects.create(user=self.coach_a, academy=self.academy)
        AcademyStaffMembership.objects.create(user=self.coach_b, academy=self.academy)
        self.list_url = reverse("training-session-list")

    def test_coach_me_returns_own_sessions_only(self):
        """?coach=me filters to only sessions created by the requesting user."""
        make_session(self.coach_a, self.academy, title="Coach A Session")
        make_session(self.coach_b, self.academy, title="Coach B Session")
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url + "?coach=me")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Coach A Session")

    def test_without_filter_returns_all_sessions(self):
        """Without ?coach=me, all sessions are returned."""
        make_session(self.coach_a, self.academy, title="Session A")
        make_session(self.coach_b, self.academy, title="Session B")
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertGreaterEqual(len(results), 2)

    def test_coach_me_with_no_sessions_returns_empty(self):
        """?coach=me for a coach with no sessions returns empty list."""
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url + "?coach=me")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(results), 0)


# ---------------------------------------------------------------------------
# Object-level training session authorization tests
# ---------------------------------------------------------------------------


class TrainingSessionObjectAuthorizationTests(APITestCase):
    """
    Verify that training session access is scoped to AcademyStaffMembership.

    A COACH or ACADEMY_ADMIN can only read, create, or update sessions in
    academies they are explicitly linked to as staff.
    """

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "objcoach@training.test")
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "objadmin@training.test")
        self.academy_a = make_academy(name="Object Auth Academy A")
        self.academy_b = make_academy(name="Object Auth Academy B")
        # Coach and admin are staff of academy A only.
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy_a)
        # One session in each academy (created via ORM to bypass view auth).
        self.session_a = make_session(self.coach, self.academy_a, title="Session in A")
        self.session_b = make_session(self.coach, self.academy_b, title="Session in B")
        self.list_url = reverse("training-session-list")
        self.detail_a = reverse("training-session-detail", kwargs={"pk": self.session_a.pk})
        self.detail_b = reverse("training-session-detail", kwargs={"pk": self.session_b.pk})

    def _payload(self, academy, **overrides):
        return {
            "academy": str(academy.pk),
            "title": "Test Session",
            "training_date": "2026-10-08",
            **overrides,
        }

    # -- CREATE --

    def test_coach_with_membership_can_create_session(self):
        """COACH with membership in academy A can create a session there (201)."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.post(self.list_url, self._payload(self.academy_a), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_coach_without_membership_cannot_create_session(self):
        """COACH without membership in academy B cannot create a session there (403)."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.post(self.list_url, self._payload(self.academy_b), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_academy_admin_without_membership_cannot_create_session(self):
        """ACADEMY_ADMIN without membership in academy B cannot create a session there (403)."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.list_url, self._payload(self.academy_b), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # -- LIST --

    def test_session_list_scoped_to_member_academies(self):
        """Session list returns only sessions in the user's member academies."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        ids = [str(r["id"]) for r in results]
        self.assertIn(str(self.session_a.pk), ids)
        self.assertNotIn(str(self.session_b.pk), ids)

    def test_coach_without_any_membership_sees_empty_list(self):
        """A COACH with no memberships at all gets 200 with an empty list."""
        no_membership_coach = make_user(User.Role.COACH, "nomem@training.test")
        self.client.force_authenticate(user=no_membership_coach)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(results), 0)

    # -- RETRIEVE --

    def test_coach_can_retrieve_session_in_member_academy(self):
        """Coach can retrieve a session in their member academy (200)."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.detail_a)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(self.session_a.pk))

    def test_coach_cannot_retrieve_session_in_nonmember_academy(self):
        """Session in a non-member academy is not in the queryset — returns 404."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.detail_b)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # -- UPDATE --

    def test_coach_can_update_session_in_member_academy(self):
        """Coach can PATCH a session in their member academy (200)."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.patch(self.detail_a, {"location": "Pitch 1"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["location"], "Pitch 1")

    def test_coach_cannot_update_session_in_nonmember_academy(self):
        """Session in a non-member academy is not in the queryset — PATCH returns 404."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.patch(self.detail_b, {"location": "Pitch 2"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_cannot_reassign_session_to_different_academy(self):
        """PATCH with a different academy ID is silently ignored — academy is immutable."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.patch(
            self.detail_a, {"academy": str(self.academy_b.pk)}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The session must still belong to academy A.
        self.assertEqual(str(response.data["academy"]), str(self.academy_a.pk))

    # -- NESTED RESOURCES (exercises & attendance) --

    def test_session_exercises_blocked_without_membership(self):
        """Accessing session exercises for a non-member academy returns 404."""
        self.client.force_authenticate(user=self.coach)
        url = reverse(
            "training-session-exercise-list",
            kwargs={"session_pk": self.session_b.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_session_attendance_blocked_without_membership(self):
        """Accessing session attendance for a non-member academy returns 404."""
        self.client.force_authenticate(user=self.coach)
        url = reverse(
            "training-attendance-list",
            kwargs={"session_pk": self.session_b.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Player Training History — authorization tests
# ---------------------------------------------------------------------------


class PlayerTrainingHistoryAuthorizationTests(APITestCase):
    """
    Verify that COACH and ACADEMY_ADMIN callers only receive sessions from
    academies they are staff of, even when the player attended sessions across
    multiple academies.  PLAYER and PARENT roles receive the full unfiltered
    history (scoped only to the target player).
    """

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "authcoach@training.test")
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "authadmin@training.test")
        self.academy_a = make_academy(name="Auth Academy A")
        self.academy_b = make_academy(name="Auth Academy B")
        # Coach and admin are staff of academy A only.
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy_a)
        AcademyStaffMembership.objects.create(user=self.admin, academy=self.academy_a)
        # A player who attended one session in each academy.
        self.player = make_player()
        # Player must be enrolled in the academy so get_player_and_check_training_access
        # can verify staff visibility of this player (returns 404 otherwise).
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy_a, joined_at="2026-01-01"
        )
        self.session_a = make_session(
            self.coach, self.academy_a, title="Academy A Session"
        )
        self.session_b = make_session(
            self.coach, self.academy_b, title="Academy B Session"
        )
        TrainingAttendance.objects.create(
            session=self.session_a, player=self.player, status="PRESENT"
        )
        TrainingAttendance.objects.create(
            session=self.session_b, player=self.player, status="PRESENT"
        )
        self.url = reverse(
            "player-training-history", kwargs={"player_pk": self.player.pk}
        )

    def test_coach_in_member_academy_sees_own_academy_sessions(self):
        """COACH with membership in academy A sees only academy A sessions."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [s["title"] for s in response.data["sessions"]]
        self.assertIn("Academy A Session", titles)
        self.assertNotIn("Academy B Session", titles)

    def test_coach_cannot_see_sessions_from_non_member_academy(self):
        """COACH in academy A gets 200 but academy B sessions are excluded."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["sessions"]), 1)

    def test_academy_admin_in_member_academy_sees_own_academy_sessions(self):
        """ACADEMY_ADMIN with membership in academy A sees only academy A sessions."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [s["title"] for s in response.data["sessions"]]
        self.assertIn("Academy A Session", titles)
        self.assertNotIn("Academy B Session", titles)

    def test_cross_academy_isolation(self):
        """
        A coach from academy B only sees academy B's sessions for the same player.
        The session from academy A is hidden from them.
        The player must also have a membership in academy B so the access guard
        can confirm coach_b's visibility of this player.
        """
        coach_b = make_user(User.Role.COACH, "coachb_auth@training.test")
        AcademyStaffMembership.objects.create(user=coach_b, academy=self.academy_b)
        # Enroll the player in academy B so staff_can_read_player passes for coach_b.
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy_b, joined_at="2026-01-01"
        )
        self.client.force_authenticate(user=coach_b)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [s["title"] for s in response.data["sessions"]]
        self.assertIn("Academy B Session", titles)
        self.assertNotIn("Academy A Session", titles)

    def test_staff_with_no_memberships_cannot_see_player(self):
        """COACH with no academy memberships cannot see the player at all (404)."""
        no_membership_coach = make_user(User.Role.COACH, "nomem_auth@training.test")
        self.client.force_authenticate(user=no_membership_coach)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_player_sees_all_own_sessions_across_academies(self):
        """PLAYER sees their complete history regardless of which academy hosted the session."""
        player_user = make_user(User.Role.PLAYER, "histplayer_auth@training.test")
        self.player.user = player_user
        self.player.save()
        self.client.force_authenticate(user=player_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["sessions"]), 2)

    def test_parent_sees_all_linked_player_sessions_across_academies(self):
        """PARENT with an explicit link sees the player's full history from all academies."""
        from apps.users.models import ParentPlayerLink
        parent_user = make_user(User.Role.PARENT, "parent_auth@training.test")
        ParentPlayerLink.objects.create(parent=parent_user, player=self.player)
        self.client.force_authenticate(user=parent_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["sessions"]), 2)


# ---------------------------------------------------------------------------
# Attendance player-affiliation regression tests (Task 2)
# ---------------------------------------------------------------------------


class AttendancePlayerAffiliationTests(APITestCase):
    """
    Verify that attendance records can only be created for players who are
    legitimately associated with the session's academy — either via a direct
    PlayerAcademyMembership or via a PlayerTeamMembership in a team that
    belongs to the session's academy.
    """

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "aff_coach@training.test")
        self.academy = make_academy(name="Affiliation Academy")
        self.other_academy = make_academy(name="Other Affiliation Academy")
        AcademyStaffMembership.objects.create(user=self.coach, academy=self.academy)
        self.session = make_session(self.coach, self.academy)
        self.client.force_authenticate(user=self.coach)
        self.url = reverse(
            "training-attendance-list",
            kwargs={"session_pk": self.session.pk},
        )

    def _post_attendance(self, player, session_status="PRESENT"):
        return self.client.post(
            self.url, {"player": str(player.pk), "status": session_status}, format="json"
        )

    def test_player_with_no_affiliation_is_rejected(self):
        """Player with no academy or team affiliation cannot be added to attendance (400)."""
        unrelated = make_player(first_name="Unrelated")
        response = self._post_attendance(unrelated)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player", response.data)

    def test_player_with_academy_membership_is_accepted(self):
        """Player with a PlayerAcademyMembership for the session's academy can be recorded (201)."""
        player = make_player(first_name="Direct")
        PlayerAcademyMembership.objects.create(
            player=player, academy=self.academy, joined_at="2024-01-01"
        )
        response = self._post_attendance(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_player_with_team_membership_in_session_academy_is_accepted(self):
        """Player with a team membership in the session's academy can be recorded (201)."""
        from apps.teams.models import PlayerTeamMembership
        team = make_team(self.academy, name="U15 Aff")
        player = make_player(first_name="TeamMember")
        PlayerTeamMembership.objects.create(
            player=player, team=team, joined_at="2024-01-01"
        )
        response = self._post_attendance(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_player_with_team_membership_in_different_academy_is_rejected(self):
        """Player affiliated only with a different academy's team is rejected (400)."""
        from apps.teams.models import PlayerTeamMembership
        other_team = make_team(self.other_academy, name="Other U15 Aff")
        player = make_player(first_name="WrongTeam")
        PlayerTeamMembership.objects.create(
            player=player, team=other_team, joined_at="2024-01-01"
        )
        response = self._post_attendance(player)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player", response.data)

    def test_player_with_left_academy_membership_still_accepted(self):
        """Historical (left) academy memberships count as affiliation (alumni scenario)."""
        player = make_player(first_name="Alumni")
        PlayerAcademyMembership.objects.create(
            player=player,
            academy=self.academy,
            joined_at="2022-09-01",
            left_at="2023-06-30",
            status=PlayerAcademyMembership.Status.LEFT,
        )
        response = self._post_attendance(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_multi_academy_player_accepted_via_correct_academy(self):
        """Multi-academy player is accepted when one of their memberships matches the session's academy."""
        player = make_player(first_name="MultiAcademy")
        other_academy = make_academy(name="Multi Other Academy")
        # Member of both academies; the session is in self.academy
        PlayerAcademyMembership.objects.create(
            player=player, academy=other_academy, joined_at="2023-01-01"
        )
        PlayerAcademyMembership.objects.create(
            player=player, academy=self.academy, joined_at="2024-01-01"
        )
        response = self._post_attendance(player)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_update_attendance_does_not_recheck_affiliation(self):
        """PATCH on an existing attendance record is not blocked by the affiliation check."""
        # Create attendance via ORM to bypass the affiliation check
        unrelated = make_player(first_name="UpdateOnly")
        attendance = TrainingAttendance.objects.create(
            session=self.session, player=unrelated, status="PRESENT"
        )
        url = reverse(
            "training-attendance-detail",
            kwargs={"session_pk": self.session.pk, "pk": attendance.pk},
        )
        response = self.client.patch(url, {"notes": "Late arrival"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
