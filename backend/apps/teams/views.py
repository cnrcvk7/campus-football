from rest_framework import mixins, viewsets

from .models import Team
from .serializers import TeamSerializer


class TeamViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Team resource.

    list:           GET   /api/teams/
    create:         POST  /api/teams/
    retrieve:       GET   /api/teams/{id}/
    partial_update: PATCH /api/teams/{id}/

    DELETE is intentionally not exposed.
    PUT is intentionally not exposed.
    """

    queryset = Team.objects.select_related("academy").all()
    serializer_class = TeamSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
