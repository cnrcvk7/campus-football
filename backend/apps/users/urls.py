from django.urls import path

from .views import (
    ActiveUserTokenRefreshView,
    LoginTokenView,
    LogoutView,
    MeView,
    ParentChildDeactivateView,
    ParentChildReactivateView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
)

urlpatterns = [
    path("auth/token/", LoginTokenView.as_view(), name="token-obtain-pair"),
    path("auth/token/refresh/", ActiveUserTokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/password-reset/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("auth/password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("auth/children/<uuid:player_id>/deactivate/", ParentChildDeactivateView.as_view(), name="parent-child-deactivate"),
    path("auth/children/<uuid:player_id>/reactivate/", ParentChildReactivateView.as_view(), name="parent-child-reactivate"),
]
