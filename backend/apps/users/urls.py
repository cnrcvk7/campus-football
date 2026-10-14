from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginTokenView, LogoutView, MeView

urlpatterns = [
    path("auth/token/", LoginTokenView.as_view(), name="token-obtain-pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
]
