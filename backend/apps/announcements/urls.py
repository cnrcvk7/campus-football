from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AnnouncementViewSet, UnreadCountView

router = DefaultRouter()
router.register("announcements", AnnouncementViewSet, basename="announcement")

urlpatterns = [
    # unread-count must come before router URLs to avoid being captured
    # by the {pk} pattern
    path(
        "announcements/unread-count/",
        UnreadCountView.as_view(),
        name="announcement-unread-count",
    ),
] + router.urls
