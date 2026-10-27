from django.db import transaction
from rest_framework import mixins, viewsets

from .models import Academy, AcademyStaffMembership
from .serializers import AcademySerializer


class AcademyViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Academy resource.

    list:           GET   /api/academies/
    create:         POST  /api/academies/
    retrieve:       GET   /api/academies/{id}/
    partial_update: PATCH /api/academies/{id}/

    DELETE is intentionally not exposed.
    PUT is intentionally not exposed.
    """

    serializer_class = AcademySerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        """
        Scope academy visibility to staff memberships.

        COACH / ACADEMY_ADMIN see only academies they are staff of.
        Superusers see all academies (PR #7 behaviour).
        """
        from .permissions import require_coach_or_admin, get_user_academy_ids
        require_coach_or_admin(self.request)
        if self.request.user.is_superuser:
            return Academy.objects.all()
        academy_ids = get_user_academy_ids(self.request.user)
        return Academy.objects.filter(id__in=academy_ids)

    def create(self, request, *args, **kwargs):
        """
        POST /api/academies/ — ACADEMY_ADMIN only.

        Automatically creates an AcademyStaffMembership for the creator so
        they can immediately see and manage the new academy under strict
        academy scoping.
        """
        from .permissions import require_academy_admin
        require_academy_admin(request)
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def perform_create(self, serializer):
        academy = serializer.save()
        if not self.request.user.is_superuser:
            AcademyStaffMembership.objects.get_or_create(
                user=self.request.user, academy=academy,
            )

    def partial_update(self, request, *args, **kwargs):
        """PATCH /api/academies/{id}/ — ACADEMY_ADMIN with staff membership for this academy."""
        from .permissions import require_academy_admin_of_academy
        require_academy_admin_of_academy(request.user, kwargs["pk"])
        return super().partial_update(request, *args, **kwargs)
