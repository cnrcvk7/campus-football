from django.urls import path

from .views import (
    InvitationCreateView,
    InvitationListView,
    InvitationPreviewView,
    InvitationRedeemView,
    InvitationRevokeView,
)

urlpatterns = [
    path("invitations/", InvitationCreateView.as_view(), name="invitation-create"),
    path("invitations/list/", InvitationListView.as_view(), name="invitation-list"),
    path("invitations/<uuid:pk>/revoke/", InvitationRevokeView.as_view(), name="invitation-revoke"),
    path("invitations/preview/<str:token>/", InvitationPreviewView.as_view(), name="invitation-preview"),
    path("invitations/redeem/<str:token>/", InvitationRedeemView.as_view(), name="invitation-redeem"),
]
