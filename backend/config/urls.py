from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.users.urls")),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.players.urls")),
    path("api/", include("apps.academies.urls")),
    path("api/", include("apps.teams.urls")),
    path("api/", include("apps.development.urls")),
    path("api/", include("apps.training.urls")),
    path("api/", include("apps.matches.urls")),
]
