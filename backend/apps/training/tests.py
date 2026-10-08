import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy
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
# 10–11. Session Exercise API tests
# ---------------------------------------------------------------------------


class SessionExerciseAPITests(APITestCase):

    def setUp(self):
        self.coach = make_user(User.Role.COACH, "secoach@training.test")
        self.academy = make_academy()
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
        self.session = make_session(self.coach, self.academy)
        self.player = make_player()
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
        """A COACH user can POST a training session (201)."""
        self.client.force_authenticate(user=self.coach)
        response = self.client.post(
            self.session_list_url, self._session_payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_academy_admin_can_manage_training(self):
        """ACADEMY_ADMIN can create and list training sessions."""
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
        """A PLAYER cannot view another player's training history (403)."""
        other_player_user = make_user(User.Role.PLAYER, "other@training.test")
        other_player = make_player(user=other_player_user)
        self.client.force_authenticate(user=self.player_user)
        url = reverse("player-training-history", kwargs={"player_pk": other_player.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

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
