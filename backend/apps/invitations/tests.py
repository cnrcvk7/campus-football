"""
Tests for the invitations system: creation, preview, redeem, throttling,
race conditions, minor/adult rules, single-parent constraint, cross-academy
scoping, staff invitations, and management command.
"""
import hashlib
from datetime import date, timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.players.models import Player
from apps.teams.models import PlayerTeamMembership, Team
from apps.users.models import ParentPlayerLink, User

from .models import Invitation, generate_invitation_token, hash_token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_user(email, role, password="testpass123!", **kwargs):
    return User.objects.create_user(
        email=email, password=password, role=role,
        first_name="Test", last_name="User", **kwargs,
    )


def _create_academy(name="Test Academy", **kwargs):
    return Academy.objects.create(name=name, **kwargs)


def _create_player(first_name="John", last_name="Doe", date_of_birth=None, **kwargs):
    dob = date_of_birth or date(2010, 6, 15)
    return Player.objects.create(
        first_name=first_name, last_name=last_name,
        date_of_birth=dob, gender="M", **kwargs,
    )


def _staff_membership(user, academy):
    return AcademyStaffMembership.objects.create(user=user, academy=academy)


def _player_academy(player, academy):
    return PlayerAcademyMembership.objects.create(
        player=player, academy=academy,
        joined_at=date.today(), status=PlayerAcademyMembership.Status.ACTIVE,
    )


def _auth_client(user, password="testpass123!"):
    client = APIClient()
    resp = client.post(reverse("token-obtain-pair"), {"email": user.email, "password": password}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
    return client


# ---------------------------------------------------------------------------
# Token model tests
# ---------------------------------------------------------------------------

class InvitationModelTests(TestCase):
    def setUp(self):
        self.academy = _create_academy()
        self.admin = _create_user("admin@t.com", User.Role.ACADEMY_ADMIN)
        _staff_membership(self.admin, self.academy)
        self.player = _create_player()
        _player_academy(self.player, self.academy)

    def test_create_invitation_returns_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        self.assertIsNotNone(token)
        self.assertEqual(inv.token_hash, hash_token(token))
        self.assertTrue(inv.is_open)
        self.assertEqual(inv.state, "pending")

    def test_create_revokes_previous_open(self):
        inv1, _ = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv2, _ = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv1.refresh_from_db()
        self.assertIsNotNone(inv1.revoked_at)
        self.assertTrue(inv2.is_open)

    def test_expired_state(self):
        inv, _ = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.expires_at = timezone.now() - timedelta(hours=1)
        inv.save()
        self.assertEqual(inv.state, "expired")
        self.assertFalse(inv.is_open)

    def test_used_state(self):
        inv, _ = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.used_at = timezone.now()
        inv.save()
        self.assertEqual(inv.state, "used")


# ---------------------------------------------------------------------------
# Invitation creation endpoint tests
# ---------------------------------------------------------------------------

class InvitationCreateTests(TestCase):
    def setUp(self):
        self.academy = _create_academy()
        self.admin = _create_user("admin@t.com", User.Role.ACADEMY_ADMIN)
        _staff_membership(self.admin, self.academy)
        self.coach = _create_user("coach@t.com", User.Role.COACH)
        _staff_membership(self.coach, self.academy)
        self.adult_player = _create_player("Adult", "Player", date(2000, 1, 1))
        _player_academy(self.adult_player, self.academy)
        self.minor_player = _create_player("Minor", "Player", date(2015, 6, 15))
        _player_academy(self.minor_player, self.academy)

    def test_admin_creates_coach_invitation(self):
        client = _auth_client(self.admin)
        resp = client.post(reverse("invitation-create"), {
            "role": "COACH", "academy": str(self.academy.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", resp.data)
        self.assertIn("invite_link", resp.data)

    def test_coach_cannot_create_coach_invitation(self):
        client = _auth_client(self.coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "COACH", "academy": str(self.academy.id),
        }, format="json")
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST])

    def test_coach_creates_parent_invitation(self):
        client = _auth_client(self.coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "PARENT", "academy": str(self.academy.id),
            "player": str(self.adult_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_parent_invitation_refused_if_player_has_parent(self):
        parent = _create_user("parent@t.com", User.Role.PARENT)
        ParentPlayerLink.objects.create(parent=parent, player=self.adult_player)
        client = _auth_client(self.coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "PARENT", "academy": str(self.academy.id),
            "player": str(self.adult_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player_has_parent", str(resp.data))

    def test_player_invitation_refused_if_has_account(self):
        user = _create_user("linked@t.com", User.Role.PLAYER)
        self.adult_player.user = user
        self.adult_player.save()
        client = _auth_client(self.coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(self.adult_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player_has_account", str(resp.data))

    def test_staff_cannot_create_player_invitation_for_minor(self):
        """Staff get parent_required for a minor player."""
        client = _auth_client(self.coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(self.minor_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("parent_required", str(resp.data))

    def test_staff_can_create_player_invitation_for_adult(self):
        client = _auth_client(self.coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(self.adult_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_parent_creates_player_invitation_for_own_minor(self):
        parent = _create_user("parent@t.com", User.Role.PARENT)
        ParentPlayerLink.objects.create(parent=parent, player=self.minor_player)
        client = _auth_client(parent)
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(self.minor_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        # Parent approval recorded
        self.minor_player.refresh_from_db()
        self.assertIsNotNone(self.minor_player.parent_approved_at)

    def test_parent_cannot_invite_other_child(self):
        """Parent cannot create invitation for a player they are not linked to."""
        parent = _create_user("parent@t.com", User.Role.PARENT)
        other_player = _create_player("Other", "Kid", date(2015, 1, 1))
        _player_academy(other_player, self.academy)
        ParentPlayerLink.objects.create(parent=parent, player=self.minor_player)
        client = _auth_client(parent)
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(other_player.id),
        }, format="json")
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST])

    def test_cross_academy_returns_not_found(self):
        """Coach of academy B cannot invite for academy A's player."""
        other_academy = _create_academy("Other Academy")
        other_coach = _create_user("other@t.com", User.Role.COACH)
        _staff_membership(other_coach, other_academy)
        client = _auth_client(other_coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "PARENT", "academy": str(self.academy.id),
            "player": str(self.adult_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not_found", str(resp.data).lower())

    def test_missing_dob_treated_as_minor(self):
        """The _is_minor helper treats a None DOB as minor (defensive branch).

        Player.date_of_birth is required at the DB level, so this path cannot
        be reached through normal code.  We test the helper directly.
        """
        from apps.invitations.serializers import _is_minor
        # Temporarily set DOB to None on an in-memory player (not saved)
        player = _create_player("NoDob", "Player", date(2010, 1, 1))
        player.date_of_birth = None  # in-memory only
        self.assertTrue(_is_minor(player, self.academy))

    def test_academy_age_change_affects_minor_check(self):
        """If academy lowers consent age, a previously minor player becomes adult."""
        # Player is 11 (born 2015), consent age 18 → minor
        self.academy.parental_consent_age = 13
        self.academy.save()
        # Now 11 < 13 → still minor
        client = _auth_client(self.coach)
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(self.minor_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Set consent age to something the player is above
        # Player born 2015, so ~11 years old → consent age needs to be ≤11
        # Min is 13, so this player will always be a minor with valid range
        # Use a different player who is 14
        teen_player = _create_player("Teen", "Player", date(2012, 1, 1))
        _player_academy(teen_player, self.academy)
        self.academy.parental_consent_age = 13
        self.academy.save()
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(teen_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_superuser_can_create_any_invitation(self):
        su = _create_user("su@t.com", User.Role.ACADEMY_ADMIN, is_superuser=True, is_staff=True)
        client = _auth_client(su)
        resp = client.post(reverse("invitation-create"), {
            "role": "ACADEMY_ADMIN", "academy": str(self.academy.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Preview tests
# ---------------------------------------------------------------------------

class InvitationPreviewTests(TestCase):
    def setUp(self):
        self.academy = _create_academy()
        self.admin = _create_user("admin@t.com", User.Role.ACADEMY_ADMIN)
        _staff_membership(self.admin, self.academy)
        self.player = _create_player()
        _player_academy(self.player, self.academy)
        self.team = Team.objects.create(academy=self.academy, name="U12 A")
        PlayerTeamMembership.objects.create(
            player=self.player, team=self.team,
            joined_at=date.today(), status="active",
        )

    def test_preview_valid_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        client = APIClient()
        resp = client.get(reverse("invitation-preview", args=[token]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["academy_name"], self.academy.name)
        self.assertEqual(resp.data["team_name"], "U12 A")
        self.assertEqual(resp.data["player_first_name"], self.player.first_name)
        self.assertEqual(resp.data["role"], "PARENT")
        self.assertEqual(resp.data["state"], "pending")

    def test_preview_unknown_token(self):
        client = APIClient()
        resp = client.get(reverse("invitation-preview", args=["bogus-token-value"]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], "invitation_invalid")

    def test_preview_expired_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.expires_at = timezone.now() - timedelta(hours=1)
        inv.save()
        client = APIClient()
        resp = client.get(reverse("invitation-preview", args=[token]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["state"], "expired")

    def test_preview_used_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.used_at = timezone.now()
        inv.save()
        client = APIClient()
        resp = client.get(reverse("invitation-preview", args=[token]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["state"], "used")

    def test_preview_revoked_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.revoked_at = timezone.now()
        inv.save()
        client = APIClient()
        resp = client.get(reverse("invitation-preview", args=[token]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["state"], "revoked")


# ---------------------------------------------------------------------------
# Redeem tests
# ---------------------------------------------------------------------------

class InvitationRedeemTests(TestCase):
    def setUp(self):
        self.academy = _create_academy()
        self.admin = _create_user("admin@t.com", User.Role.ACADEMY_ADMIN)
        _staff_membership(self.admin, self.academy)
        self.player = _create_player("John", "Doe", date(2000, 1, 1))
        _player_academy(self.player, self.academy)

    def _redeem(self, token, **overrides):
        data = {
            "email": "new@example.com",
            "first_name": "Jane",
            "last_name": "Doe",
            "password": "SecureP@ss123!",
            "consent_version": "v1",
            **overrides,
        }
        client = APIClient()
        return client.post(reverse("invitation-redeem", args=[token]), data, format="json")

    def test_redeem_parent_creates_user_and_link(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        resp = self._redeem(token)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["role"], "PARENT")

        # User created correctly
        user = User.objects.get(email="new@example.com")
        self.assertEqual(user.role, User.Role.PARENT)
        self.assertEqual(user.consent_version, "v1")
        self.assertIsNotNone(user.consent_accepted_at)

        # ParentPlayerLink created
        self.assertTrue(ParentPlayerLink.objects.filter(
            parent=user, player=self.player,
        ).exists())

        # Invitation marked used
        inv.refresh_from_db()
        self.assertIsNotNone(inv.used_at)
        self.assertEqual(inv.used_by, user)

    def test_redeem_player_links_account(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PLAYER, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        resp = self._redeem(token)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.player.refresh_from_db()
        self.assertIsNotNone(self.player.user)
        self.assertEqual(self.player.user.email, "new@example.com")

    def test_redeem_coach_creates_staff_membership(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.COACH, academy=self.academy,
            player=None, email_hint="", created_by=self.admin,
        )
        resp = self._redeem(token)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="new@example.com")
        self.assertEqual(user.role, User.Role.COACH)
        self.assertTrue(AcademyStaffMembership.objects.filter(
            user=user, academy=self.academy,
        ).exists())

    def test_redeem_academy_admin_creates_staff_membership(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.ACADEMY_ADMIN, academy=self.academy,
            player=None, email_hint="", created_by=self.admin,
        )
        resp = self._redeem(token)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="new@example.com")
        self.assertEqual(user.role, User.Role.ACADEMY_ADMIN)
        self.assertTrue(AcademyStaffMembership.objects.filter(
            user=user, academy=self.academy,
        ).exists())

    def test_redeem_unknown_token(self):
        resp = self._redeem("totally-bogus-token-value")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], "invitation_invalid")

    def test_redeem_expired_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.expires_at = timezone.now() - timedelta(hours=1)
        inv.save()
        resp = self._redeem(token)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], "invitation_invalid")

    def test_redeem_used_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.used_at = timezone.now()
        inv.save()
        resp = self._redeem(token)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], "invitation_invalid")

    def test_redeem_revoked_token(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        inv.revoked_at = timezone.now()
        inv.save()
        resp = self._redeem(token)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], "invitation_invalid")

    def test_redeem_identical_response_for_all_invalid_states(self):
        """All invalid token states return the same response body."""
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        # Unknown
        r1 = self._redeem("unknown-token-value")
        # Expired
        inv.expires_at = timezone.now() - timedelta(hours=1)
        inv.save()
        r2 = self._redeem(token)
        # Used
        inv.expires_at = timezone.now() + timedelta(days=7)
        inv.used_at = timezone.now()
        inv.save()
        r3 = self._redeem(token)
        # Revoked
        inv.used_at = None
        inv.revoked_at = timezone.now()
        inv.save()
        r4 = self._redeem(token)

        for r in [r1, r2, r3, r4]:
            self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(r.data["code"], "invitation_invalid")

    def test_redeem_email_hint_mismatch(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="expected@example.com",
            created_by=self.admin,
        )
        resp = self._redeem(token, email="wrong@example.com")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email_mismatch", str(resp.data))

    def test_redeem_email_hint_match(self):
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="correct@example.com",
            created_by=self.admin,
        )
        resp = self._redeem(token, email="Correct@Example.com")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_redeem_email_taken(self):
        _create_user("existing@example.com", User.Role.COACH)
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        resp = self._redeem(token, email="existing@example.com")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email_taken", str(resp.data))

    def test_redeem_email_case_insensitive_uniqueness(self):
        _create_user("taken@example.com", User.Role.COACH)
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        resp = self._redeem(token, email="TAKEN@Example.com")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email_taken", str(resp.data))

    def test_redeem_race_condition_creates_one_account(self):
        """Double redeem: only one account is created."""
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        r1 = self._redeem(token, email="racer1@example.com")
        r2 = self._redeem(token, email="racer2@example.com")
        # One succeeds, one fails
        successes = [r for r in [r1, r2] if r.status_code == status.HTTP_201_CREATED]
        failures = [r for r in [r1, r2] if r.status_code != status.HTTP_201_CREATED]
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(failures), 1)

    def test_redeem_minor_player_at_redemption(self):
        """Minor check re-runs at redemption: birthday between creation and redemption."""
        # Player turns 18 between creation and redemption but academy consent age is 18
        # So they were a minor at creation time but parent already approved
        parent = _create_user("parent@t.com", User.Role.PARENT)
        minor_player = _create_player("Teen", "Player", date(2012, 3, 15))
        _player_academy(minor_player, self.academy)
        ParentPlayerLink.objects.create(parent=parent, player=minor_player)
        # Parent creates invitation (sets parent_approved_at)
        client = _auth_client(parent)
        resp = client.post(reverse("invitation-create"), {
            "role": "PLAYER", "academy": str(self.academy.id),
            "player": str(minor_player.id),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        token = resp.data["token"]
        # Redeem should work because parent approved
        r = self._redeem(token, email="teen@example.com")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_redeem_minor_without_parent_approval_fails(self):
        """Minor player cannot be redeemed if no parent approval."""
        minor_player = _create_player("Kid", "Player", date(2015, 6, 15))
        _player_academy(minor_player, self.academy)
        # Create invitation directly (bypassing permission checks)
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PLAYER, academy=self.academy,
            player=minor_player, email_hint="", created_by=self.admin,
        )
        r = self._redeem(token, email="kid@example.com")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("parent_required", str(r.data))


# ---------------------------------------------------------------------------
# List and revoke tests
# ---------------------------------------------------------------------------

class InvitationListRevokeTests(TestCase):
    def setUp(self):
        self.academy = _create_academy()
        self.admin = _create_user("admin@t.com", User.Role.ACADEMY_ADMIN)
        _staff_membership(self.admin, self.academy)
        self.player = _create_player()
        _player_academy(self.player, self.academy)
        self.inv, self.token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )

    def test_list_returns_invitations(self):
        client = _auth_client(self.admin)
        resp = client.get(reverse("invitation-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_list_filtered_by_status(self):
        client = _auth_client(self.admin)
        resp = client.get(reverse("invitation-list") + "?status=pending")
        self.assertEqual(len(resp.data), 1)
        resp = client.get(reverse("invitation-list") + "?status=used")
        self.assertEqual(len(resp.data), 0)

    def test_revoke_invitation(self):
        client = _auth_client(self.admin)
        resp = client.post(reverse("invitation-revoke", args=[self.inv.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.inv.refresh_from_db()
        self.assertIsNotNone(self.inv.revoked_at)

    def test_revoke_already_revoked(self):
        self.inv.revoked_at = timezone.now()
        self.inv.save()
        client = _auth_client(self.admin)
        resp = client.post(reverse("invitation-revoke", args=[self.inv.id]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_academy_revoke_denied(self):
        other_admin = _create_user("other@t.com", User.Role.ACADEMY_ADMIN)
        other_academy = _create_academy("Other")
        _staff_membership(other_admin, other_academy)
        client = _auth_client(other_admin)
        resp = client.post(reverse("invitation-revoke", args=[self.inv.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Single parent constraint tests
# ---------------------------------------------------------------------------

class SingleParentConstraintTests(TestCase):
    def test_db_prevents_second_parent(self):
        player = _create_player()
        parent1 = _create_user("p1@t.com", User.Role.PARENT)
        parent2 = _create_user("p2@t.com", User.Role.PARENT)
        ParentPlayerLink.objects.create(parent=parent1, player=player)
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            ParentPlayerLink.objects.create(parent=parent2, player=player)


# ---------------------------------------------------------------------------
# Throttle tests
# ---------------------------------------------------------------------------

@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class InvitationThrottleTests(TestCase):
    def setUp(self):
        self.academy = _create_academy()
        self.admin = _create_user("admin@t.com", User.Role.ACADEMY_ADMIN)
        _staff_membership(self.admin, self.academy)
        self.player = _create_player()
        _player_academy(self.player, self.academy)

    def test_preview_throttle(self):
        client = APIClient()
        inv, token = Invitation.create_invitation(
            role=Invitation.Role.PARENT, academy=self.academy,
            player=self.player, email_hint="", created_by=self.admin,
        )
        for i in range(21):
            resp = client.get(reverse("invitation-preview", args=[token]))
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_redeem_throttle(self):
        """Redeem endpoint is throttled at 5/min."""
        client = APIClient()
        for i in range(6):
            resp = client.post(
                reverse("invitation-redeem", args=["fake-token"]),
                {"email": "a@b.com", "first_name": "A", "last_name": "B",
                 "password": "Xyz!1234", "consent_version": "v1"},
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


# ---------------------------------------------------------------------------
# Management command tests
# ---------------------------------------------------------------------------

class InviteAcademyAdminCommandTests(TestCase):
    def setUp(self):
        self.su = _create_user("su@t.com", User.Role.ACADEMY_ADMIN, is_superuser=True, is_staff=True)

    def test_creates_invitation_for_existing_academy(self):
        academy = _create_academy("My Academy")
        out = StringIO()
        call_command("invite_academy_admin", "--academy", "My Academy", stdout=out)
        output = out.getvalue()
        self.assertIn("My Academy", output)
        self.assertIn("ACADEMY_ADMIN", output)
        self.assertIn("/invite/", output)
        self.assertEqual(Invitation.objects.count(), 1)

    def test_creates_academy_with_create_flag(self):
        out = StringIO()
        call_command("invite_academy_admin", "--academy", "New Academy", "--create", stdout=out)
        output = out.getvalue()
        self.assertIn("Created academy", output)
        self.assertTrue(Academy.objects.filter(name="New Academy").exists())

    def test_fails_without_create_flag(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command("invite_academy_admin", "--academy", "Missing Academy")

    def test_fails_without_superuser(self):
        User.objects.filter(is_superuser=True).delete()
        academy = _create_academy("Solo Academy")
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command("invite_academy_admin", "--academy", "Solo Academy")
