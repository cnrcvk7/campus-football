import logging
from datetime import date

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.players.models import Player
from apps.users.models import ParentPlayerLink, User

from .models import Invitation, hash_token, tokens_match

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _player_age(player, reference_date=None):
    """Return the player's age in years, or None if DOB is missing."""
    if not player.date_of_birth:
        return None
    ref = reference_date or date.today()
    dob = player.date_of_birth
    return ref.year - dob.year - ((ref.month, ref.day) < (dob.month, dob.day))


def _is_minor(player, academy):
    """True if the player is below the academy's consent age (or DOB missing)."""
    age = _player_age(player)
    if age is None:
        return True  # safe default
    return age < academy.parental_consent_age


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

class InvitationCreateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Invitation.Role.choices)
    academy = serializers.PrimaryKeyRelatedField(queryset=Academy.objects.all())
    player = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), required=False, allow_null=True,
    )
    email_hint = serializers.EmailField(required=False, allow_blank=True, default="")

    def validate(self, data):
        user = self.context["request"].user
        role = data["role"]
        academy = data["academy"]
        player = data.get("player")

        # --- Player required for PARENT / PLAYER roles ---
        if role in (Invitation.Role.PARENT, Invitation.Role.PLAYER):
            if player is None:
                raise serializers.ValidationError(
                    {"player": "A player is required for PARENT and PLAYER invitations."}
                )

        # --- Academy scoping: out-of-scope → 404 ---
        if not user.is_superuser:
            self._check_academy_scope(user, academy, player, role)

        # --- Role-specific permission checks ---
        if role in (Invitation.Role.COACH, Invitation.Role.ACADEMY_ADMIN):
            self._check_staff_invitation_permission(user, academy)
        elif role == Invitation.Role.PARENT:
            self._check_parent_invitation_permission(user, academy, player)
        elif role == Invitation.Role.PLAYER:
            self._check_player_invitation_permission(user, academy, player)

        return data

    def _check_academy_scope(self, user, academy, player, role):
        """Ensure the user has visibility of this academy (404 if not)."""
        if user.role == User.Role.PARENT:
            # Parents: check they have a child in this academy
            linked_player_ids = ParentPlayerLink.objects.filter(
                parent=user
            ).values_list("player_id", flat=True)
            has_child_in_academy = PlayerAcademyMembership.objects.filter(
                player_id__in=linked_player_ids,
                academy=academy,
                status=PlayerAcademyMembership.Status.ACTIVE,
            ).exists()
            if not has_child_in_academy:
                raise serializers.ValidationError(
                    {"academy": "Not found."},
                    code="not_found",
                )
        elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
            if not AcademyStaffMembership.objects.filter(
                user=user, academy=academy
            ).exists():
                raise serializers.ValidationError(
                    {"academy": "Not found."},
                    code="not_found",
                )
        # PLAYER role users cannot create invitations (no branch needed)

    def _check_staff_invitation_permission(self, user, academy):
        """COACH/ACADEMY_ADMIN invitations: only ACADEMY_ADMIN of this academy."""
        if user.is_superuser:
            return
        if user.role != User.Role.ACADEMY_ADMIN:
            raise serializers.ValidationError(
                {"role": "Only academy admins can invite staff."},
                code="permission_denied",
            )
        if not AcademyStaffMembership.objects.filter(
            user=user, academy=academy
        ).exists():
            raise serializers.ValidationError(
                {"academy": "Not found."},
                code="not_found",
            )

    def _check_parent_invitation_permission(self, user, academy, player):
        """PARENT invitation: staff of the academy; player must have ACTIVE membership."""
        if user.is_superuser:
            return

        # Player must have active membership in this academy
        if not PlayerAcademyMembership.objects.filter(
            player=player, academy=academy,
            status=PlayerAcademyMembership.Status.ACTIVE,
        ).exists():
            raise serializers.ValidationError(
                {"player": "Not found."},
                code="not_found",
            )

        # Player already has a parent?
        if ParentPlayerLink.objects.filter(player=player).exists():
            raise serializers.ValidationError(
                {"player": "This player already has a linked parent."},
                code="player_has_parent",
            )

        # Must be COACH or ACADEMY_ADMIN staff of the academy
        if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
            raise serializers.ValidationError(
                {"role": "Only staff can invite parents."},
                code="permission_denied",
            )
        if not AcademyStaffMembership.objects.filter(
            user=user, academy=academy
        ).exists():
            raise serializers.ValidationError(
                {"academy": "Not found."},
                code="not_found",
            )

    def _check_player_invitation_permission(self, user, academy, player):
        """PLAYER invitation: minor → only parent; adult → staff or parent."""
        if user.is_superuser:
            return

        # Player must have active membership in this academy
        if not PlayerAcademyMembership.objects.filter(
            player=player, academy=academy,
            status=PlayerAcademyMembership.Status.ACTIVE,
        ).exists():
            raise serializers.ValidationError(
                {"player": "Not found."},
                code="not_found",
            )

        # Player already has a user account?
        if player.user is not None:
            raise serializers.ValidationError(
                {"player": "This player already has a user account."},
                code="player_has_account",
            )

        minor = _is_minor(player, academy)

        if user.role == User.Role.PARENT:
            # Parent can invite their own child (minor or adult)
            if not ParentPlayerLink.objects.filter(
                parent=user, player=player
            ).exists():
                raise serializers.ValidationError(
                    {"player": "Not found."},
                    code="not_found",
                )
            # Record parent approval for minors
            if minor:
                now = timezone.now()
                Player.objects.filter(pk=player.pk).update(
                    parent_approved_at=now,
                    approved_by=user,
                )
        elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
            if minor:
                raise serializers.ValidationError(
                    {"player": "Minor players can only be invited by their linked parent."},
                    code="parent_required",
                )
            # Staff can invite adult players
            if not AcademyStaffMembership.objects.filter(
                user=user, academy=academy
            ).exists():
                raise serializers.ValidationError(
                    {"academy": "Not found."},
                    code="not_found",
                )
        else:
            raise serializers.ValidationError(
                {"role": "You do not have permission to create this invitation."},
                code="permission_denied",
            )

    def create(self, validated_data):
        user = self.context["request"].user
        invitation, plain_token = Invitation.create_invitation(
            role=validated_data["role"],
            academy=validated_data["academy"],
            player=validated_data.get("player"),
            email_hint=validated_data.get("email_hint", ""),
            created_by=user,
        )
        logger.info("Invitation %s created by user %s", invitation.id, user.id)
        return invitation, plain_token


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

class InvitationListSerializer(serializers.ModelSerializer):
    state = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = [
            "id", "role", "academy", "player", "email_hint",
            "created_by", "expires_at", "used_at", "used_by",
            "revoked_at", "state", "created_at",
        ]
        read_only_fields = [
            "id", "role", "academy", "player", "email_hint",
            "created_by", "expires_at", "used_at", "used_by",
            "revoked_at", "created_at",
        ]

    def get_state(self, obj):
        return obj.state


# ---------------------------------------------------------------------------
# Preview (public, minimal)
# ---------------------------------------------------------------------------

class InvitationPreviewSerializer(serializers.Serializer):
    academy_name = serializers.CharField()
    team_name = serializers.CharField(allow_blank=True)
    player_first_name = serializers.CharField(allow_blank=True)
    role = serializers.CharField()
    state = serializers.CharField()


# ---------------------------------------------------------------------------
# Redeem (public)
# ---------------------------------------------------------------------------

class InvitationRedeemSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    password = serializers.CharField(write_only=True)
    consent_version = serializers.CharField(max_length=50)

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists.",
                code="email_taken",
            )
        return value

    def validate(self, data):
        invitation = self.context["invitation"]

        # Check email hint
        if invitation.email_hint:
            if data["email"].lower() != invitation.email_hint.lower():
                raise serializers.ValidationError(
                    {"email": "Email does not match the expected address."},
                    code="email_mismatch",
                )

        # Re-check minor status at redemption time for PLAYER invitations
        if invitation.role == Invitation.Role.PLAYER and invitation.player:
            academy = invitation.academy
            if _is_minor(invitation.player, academy):
                # Verify parent approval exists
                if not invitation.player.parent_approved_at:
                    raise serializers.ValidationError(
                        {"player": "Parental approval is required for minor players."},
                        code="parent_required",
                    )

        return data

    @transaction.atomic
    def create(self, validated_data):
        invitation = self.context["invitation"]

        # Lock the invitation row to prevent race conditions
        locked_invitation = (
            Invitation.objects.select_for_update()
            .get(pk=invitation.pk)
        )

        # Double-check the invitation is still open
        if not locked_invitation.is_open:
            raise serializers.ValidationError(
                {"token": "This invitation is no longer valid."},
                code="invitation_invalid",
            )

        now = timezone.now()

        # Create the user
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            role=locked_invitation.role,
            consent_version=validated_data["consent_version"],
            consent_accepted_at=now,
        )

        # Link based on role
        if locked_invitation.role == Invitation.Role.PLAYER:
            player = locked_invitation.player
            player.user = user
            player.save(update_fields=["user", "updated_at"])
        elif locked_invitation.role == Invitation.Role.PARENT:
            ParentPlayerLink.objects.create(
                parent=user,
                player=locked_invitation.player,
            )
        elif locked_invitation.role in (
            Invitation.Role.COACH, Invitation.Role.ACADEMY_ADMIN
        ):
            AcademyStaffMembership.objects.create(
                user=user,
                academy=locked_invitation.academy,
            )

        # Mark invitation as used
        locked_invitation.used_at = now
        locked_invitation.used_by = user
        locked_invitation.save(update_fields=["used_at", "used_by"])

        logger.info("Invitation %s redeemed by new user %s", locked_invitation.id, user.id)

        # Generate JWT tokens (same as login)
        refresh = RefreshToken.for_user(user)
        return {
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }
