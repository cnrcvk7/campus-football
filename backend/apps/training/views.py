from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .models import Exercise, TrainingAttendance, TrainingSession, TrainingSessionExercise
from .permissions import get_player_and_check_training_access, require_coach_or_admin
from .serializers import (
    ExerciseSerializer,
    PlayerTrainingSessionSerializer,
    SessionExerciseReadSerializer,
    SessionExerciseWriteSerializer,
    TrainingAttendanceReadSerializer,
    TrainingAttendanceWriteSerializer,
    TrainingSessionReadSerializer,
    TrainingSessionWriteSerializer,
)


# ---------------------------------------------------------------------------
# Exercises
# ---------------------------------------------------------------------------


class ExerciseViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    list:           GET   /api/training/exercises/
    create:         POST  /api/training/exercises/
    retrieve:       GET   /api/training/exercises/{id}/
    partial_update: PATCH /api/training/exercises/{id}/
    """

    serializer_class = ExerciseSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        require_coach_or_admin(self.request)
        return Exercise.objects.all().select_related("created_by").order_by("category", "name")

    def perform_create(self, serializer):
        require_coach_or_admin(self.request)
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        require_coach_or_admin(self.request)
        # Object-level ownership check: only the user who created an exercise
        # may update it.  created_by is read-only in the serializer, so it
        # cannot be spoofed through request data.
        if serializer.instance.created_by_id != self.request.user.pk:
            raise PermissionDenied("You can only update exercises you created.")
        serializer.save()


# ---------------------------------------------------------------------------
# Training Sessions
# ---------------------------------------------------------------------------


class TrainingSessionViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    list:           GET   /api/training/sessions/
    create:         POST  /api/training/sessions/
    retrieve:       GET   /api/training/sessions/{id}/
    partial_update: PATCH /api/training/sessions/{id}/
    """

    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action in ("create", "partial_update"):
            return TrainingSessionWriteSerializer
        return TrainingSessionReadSerializer

    def get_queryset(self):
        require_coach_or_admin(self.request)
        qs = (
            TrainingSession.objects
            .select_related("academy", "team", "coach")
            .prefetch_related("focus_skills", "session_exercises__exercise")
            .order_by("-training_date", "-created_at")
        )
        if not self.request.user.is_superuser:
            from apps.academies.permissions import get_user_academy_ids
            academy_ids = get_user_academy_ids(self.request.user)
            qs = qs.filter(academy_id__in=academy_ids)
        if self.request.query_params.get("coach") == "me":
            qs = qs.filter(coach=self.request.user)
        return qs

    def create(self, request, *args, **kwargs):
        """POST /api/training/sessions/ — COACH or ACADEMY_ADMIN with staff membership."""
        from apps.academies.permissions import require_staff_of_academy
        require_staff_of_academy(request.user, request.data.get("academy"))
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(coach=self.request.user)

    def perform_update(self, serializer):
        from apps.academies.permissions import require_staff_of_academy
        require_staff_of_academy(self.request.user, serializer.instance.academy_id)
        serializer.save()


# ---------------------------------------------------------------------------
# Session Exercises  (nested under /training/sessions/{session_pk}/)
# ---------------------------------------------------------------------------


class SessionExerciseViewSet(viewsets.GenericViewSet):
    """
    list:   GET  /api/training/sessions/{session_pk}/exercises/
    create: POST /api/training/sessions/{session_pk}/exercises/
    """

    http_method_names = ["get", "post", "head", "options"]

    def _get_session(self) -> TrainingSession:
        require_coach_or_admin(self.request)
        qs = TrainingSession.objects.select_related("academy")
        if not self.request.user.is_superuser:
            from apps.academies.permissions import get_user_academy_ids
            academy_ids = get_user_academy_ids(self.request.user)
            qs = qs.filter(academy_id__in=academy_ids)
        try:
            return qs.get(pk=self.kwargs["session_pk"])
        except TrainingSession.DoesNotExist:
            from django.http import Http404
            raise Http404

    def list(self, request, session_pk=None):
        session = self._get_session()
        exercises = (
            session.session_exercises.select_related("exercise").order_by("order")
        )
        return Response(
            SessionExerciseReadSerializer(
                exercises, many=True, context={"request": request}
            ).data
        )

    def create(self, request, session_pk=None):
        session = self._get_session()
        serializer = SessionExerciseWriteSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(session=session)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Attendance  (nested under /training/sessions/{session_pk}/)
# ---------------------------------------------------------------------------


class AttendanceViewSet(viewsets.GenericViewSet):
    """
    list:           GET   /api/training/sessions/{session_pk}/attendance/
    create:         POST  /api/training/sessions/{session_pk}/attendance/
    partial_update: PATCH /api/training/sessions/{session_pk}/attendance/{pk}/
    """

    http_method_names = ["get", "post", "patch", "head", "options"]

    def _get_session(self) -> TrainingSession:
        require_coach_or_admin(self.request)
        qs = TrainingSession.objects.select_related("academy")
        if not self.request.user.is_superuser:
            from apps.academies.permissions import get_user_academy_ids
            academy_ids = get_user_academy_ids(self.request.user)
            qs = qs.filter(academy_id__in=academy_ids)
        try:
            return qs.get(pk=self.kwargs["session_pk"])
        except TrainingSession.DoesNotExist:
            from django.http import Http404
            raise Http404

    def list(self, request, session_pk=None):
        session = self._get_session()
        attendance = (
            session.attendance.select_related("player").order_by(
                "player__last_name", "player__first_name"
            )
        )
        return Response(
            TrainingAttendanceReadSerializer(
                attendance, many=True, context={"request": request}
            ).data
        )

    def create(self, request, session_pk=None):
        session = self._get_session()
        serializer = TrainingAttendanceWriteSerializer(
            data=request.data,
            context={"session": session, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, session_pk=None, pk=None):
        session = self._get_session()
        attendance = get_object_or_404(TrainingAttendance, pk=pk, session=session)
        serializer = TrainingAttendanceWriteSerializer(
            attendance,
            data=request.data,
            partial=True,
            context={"session": session, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Player Training History
# ---------------------------------------------------------------------------


class PlayerTrainingHistoryView(APIView):
    """
    GET /api/players/{player_pk}/training/history/

    Returns the player's full training history — all sessions they have an
    attendance record for, with the attendance status included inline.
    """

    def get(self, request, player_pk):
        player = get_player_and_check_training_access(request, player_pk)

        sessions = (
            TrainingSession.objects.filter(attendance__player=player)
            .select_related("academy", "team")
            .prefetch_related("focus_skills", "attendance")
            .order_by("-training_date", "-created_at")
            .distinct()
        )

        # Coaches and academy admins can only view sessions belonging to
        # academies they are explicitly staff of.  Players and parents already
        # have their access scoped at the player level above; they receive the
        # full unfiltered history.
        if (
            request.user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN)
            and not request.user.is_superuser
        ):
            from apps.academies.permissions import get_user_academy_ids
            academy_ids = get_user_academy_ids(request.user)
            sessions = sessions.filter(academy_id__in=academy_ids)

        serializer = PlayerTrainingSessionSerializer(
            sessions,
            many=True,
            context={"player": player, "request": request},
        )
        return Response({"sessions": serializer.data})
