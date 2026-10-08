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
