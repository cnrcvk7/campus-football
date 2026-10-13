from rest_framework import mixins, viewsets

from .models import Academy
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

    queryset = Academy.objects.all()
    serializer_class = AcademySerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def list(self, request, *args, **kwargs):
        """GET /api/academies/ — COACH or ACADEMY_ADMIN only."""
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        """GET /api/academies/{id}/ — COACH or ACADEMY_ADMIN only."""
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        """POST /api/academies/ — ACADEMY_ADMIN only."""
        from .permissions import require_academy_admin
        require_academy_admin(request)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """PATCH /api/academies/{id}/ — ACADEMY_ADMIN with staff membership for this academy."""
        from .permissions import require_academy_admin_of_academy
        require_academy_admin_of_academy(request.user, kwargs["pk"])
        return super().partial_update(request, *args, **kwargs)
