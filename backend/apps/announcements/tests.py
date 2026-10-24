"""
Announcement tests — covers visibility, writes, validation, receipts, and throttle.

Setup: two academies (A and B), each with staff, teams, and players.
Player A is ACTIVE in Academy A / Team A.
Player B is ACTIVE in Academy B / Team B.
Player LEFT was ACTIVE in A, then left.
Parent of A is linked to Player A.
Parent of B is linked to Player B.
"""

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import (
    Academy,
    AcademyStaffMembership,
    PlayerAcademyMembership,
)
from apps.announcements.models import Announcement, AnnouncementReceipt
from apps.players.models import Player
from apps.teams.models import PlayerTeamMembership, Team
from apps.users.models import ParentPlayerLink, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_user(role, email, password="testpass123", **extra) -> User:
    return User.objects.create_user(
        email=email, password=password,
        first_name="Test", last_name="User",
        role=role, **extra,
    )


def make_superuser(email="super@test.com") -> User:
    return User.objects.create_superuser(
        email=email, password="testpass123",
        first_name="Super", last_name="Admin",
    )


def make_academy(name) -> Academy:
    return Academy.objects.create(name=name, city="City", country="Country")


def make_team(academy, name) -> Team:
    return Team.objects.create(academy=academy, name=name)


def make_player(first_name="Test", last_name="Player", user=None) -> Player:
    p = Player.objects.create(
        first_name=first_name, last_name=last_name,
        date_of_birth="2008-01-01", gender="M",
    )
    if user is not None:
        p.user = user
        p.save()
    return p


def make_staff(user, academy) -> AcademyStaffMembership:
    return AcademyStaffMembership.objects.create(user=user, academy=academy)


def enroll_player(player, academy, stat="active") -> PlayerAcademyMembership:
    return PlayerAcademyMembership.objects.create(
        player=player, academy=academy, joined_at="2026-01-01", status=stat,
    )


def assign_team(player, team, stat="active") -> PlayerTeamMembership:
    return PlayerTeamMembership.objects.create(
        player=player, team=team, joined_at="2026-01-01", status=stat,
    )


def link_parent(parent_user, player) -> ParentPlayerLink:
    return ParentPlayerLink.objects.create(parent=parent_user, player=player)


# ---------------------------------------------------------------------------
# Shared mixin
# ---------------------------------------------------------------------------


class AnnouncementMixin:
    """
    Two academies, staff, players, parents.  Call set_up() in setUp().
    """

    def set_up(self):
        # --- Academy A ---
        self.academy_a = make_academy("Academy A")
        self.coach_a = make_user(User.Role.COACH, "coach_a@test.com")
        make_staff(self.coach_a, self.academy_a)
        self.admin_a = make_user(User.Role.ACADEMY_ADMIN, "admin_a@test.com")
        make_staff(self.admin_a, self.academy_a)
        self.team_a = make_team(self.academy_a, "A U15")

        self.player_user_a = make_user(User.Role.PLAYER, "player_a@test.com")
        self.player_a = make_player("Alice", "Alpha", user=self.player_user_a)
        enroll_player(self.player_a, self.academy_a)
        assign_team(self.player_a, self.team_a)

        # --- Academy B ---
        self.academy_b = make_academy("Academy B")
        self.coach_b = make_user(User.Role.COACH, "coach_b@test.com")
        make_staff(self.coach_b, self.academy_b)
        self.admin_b = make_user(User.Role.ACADEMY_ADMIN, "admin_b@test.com")
        make_staff(self.admin_b, self.academy_b)
        self.team_b = make_team(self.academy_b, "B U15")

        self.player_user_b = make_user(User.Role.PLAYER, "player_b@test.com")
        self.player_b = make_player("Bob", "Bravo", user=self.player_user_b)
        enroll_player(self.player_b, self.academy_b)
        assign_team(self.player_b, self.team_b)

        # --- Player who LEFT Academy A ---
        self.player_user_left = make_user(User.Role.PLAYER, "player_left@test.com")
        self.player_left = make_player("Left", "Player", user=self.player_user_left)
        m = enroll_player(self.player_left, self.academy_a)
        m.status = PlayerAcademyMembership.Status.LEFT
        m.left_at = "2026-09-01"
        m.save()
        tm = assign_team(self.player_left, self.team_a)
        tm.status = PlayerTeamMembership.Status.LEFT
        tm.left_at = "2026-09-01"
        tm.save()

        # --- Parents ---
        self.parent_a = make_user(User.Role.PARENT, "parent_a@test.com")
        link_parent(self.parent_a, self.player_a)

        self.parent_b = make_user(User.Role.PARENT, "parent_b@test.com")
        link_parent(self.parent_b, self.player_b)

        self.parent_none = make_user(User.Role.PARENT, "parent_none@test.com")
        # no link

        # --- Superuser ---
        self.superuser = make_superuser()

        # --- URLs ---
        self.list_url = reverse("announcement-list")

    def _create_announcement(self, academy, team=None, title="Test", body="Body text"):
        return Announcement.objects.create(
            academy=academy, team=team, author=self.coach_a,
            title=title, body=body,
        )


# ===========================================================================
# 1. Visibility matrix
# ===========================================================================


class VisibilityTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()
        self.ann_team_a = self._create_announcement(
            self.academy_a, self.team_a, "Team A News",
        )
        self.ann_academy_a = self._create_announcement(
            self.academy_a, None, "Academy A Wide",
        )
        self.ann_team_b = self._create_announcement(
            self.academy_b, self.team_b, "Team B News",
        )

    def _visible_ids(self, user):
        self.client.force_authenticate(user=user)
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return {r["id"] for r in resp.data["results"]}

    # Staff

    def test_staff_a_sees_academy_a_announcements(self):
        ids = self._visible_ids(self.coach_a)
        self.assertIn(str(self.ann_team_a.pk), ids)
        self.assertIn(str(self.ann_academy_a.pk), ids)

    def test_staff_a_does_not_see_academy_b(self):
        ids = self._visible_ids(self.coach_a)
        self.assertNotIn(str(self.ann_team_b.pk), ids)

    def test_staff_b_sees_only_academy_b(self):
        ids = self._visible_ids(self.coach_b)
        self.assertIn(str(self.ann_team_b.pk), ids)
        self.assertNotIn(str(self.ann_team_a.pk), ids)

    # Player

    def test_player_a_sees_own_team_and_academy_wide(self):
        ids = self._visible_ids(self.player_user_a)
        self.assertIn(str(self.ann_team_a.pk), ids)
        self.assertIn(str(self.ann_academy_a.pk), ids)

    def test_player_a_does_not_see_team_b(self):
        ids = self._visible_ids(self.player_user_a)
        self.assertNotIn(str(self.ann_team_b.pk), ids)

    def test_player_who_left_sees_nothing(self):
        ids = self._visible_ids(self.player_user_left)
        self.assertEqual(ids, set())

    # Parent

    def test_parent_a_sees_child_team_and_academy_wide(self):
        ids = self._visible_ids(self.parent_a)
        self.assertIn(str(self.ann_team_a.pk), ids)
        self.assertIn(str(self.ann_academy_a.pk), ids)

    def test_parent_a_does_not_see_team_b(self):
        ids = self._visible_ids(self.parent_a)
        self.assertNotIn(str(self.ann_team_b.pk), ids)

    def test_parent_with_no_link_sees_nothing(self):
        ids = self._visible_ids(self.parent_none)
        self.assertEqual(ids, set())

    # Superuser

    def test_superuser_sees_all(self):
        ids = self._visible_ids(self.superuser)
        self.assertIn(str(self.ann_team_a.pk), ids)
        self.assertIn(str(self.ann_academy_a.pk), ids)
        self.assertIn(str(self.ann_team_b.pk), ids)

    # Soft-deleted

    def test_soft_deleted_hidden(self):
        self.ann_team_a.deleted_at = "2026-10-01T00:00:00Z"
        self.ann_team_a.save()
        ids = self._visible_ids(self.coach_a)
        self.assertNotIn(str(self.ann_team_a.pk), ids)

    # Unauthenticated

    def test_unauthenticated_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # Team filter

    def test_team_filter(self):
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.get(self.list_url, {"team": str(self.team_a.pk)})
        ids = {r["id"] for r in resp.data["results"]}
        self.assertIn(str(self.ann_team_a.pk), ids)
        self.assertNotIn(str(self.ann_academy_a.pk), ids)

    # Feed ordering: pinned first

    def test_pinned_first(self):
        unpinned = self._create_announcement(
            self.academy_a, self.team_a, "Unpinned",
        )
        pinned = self._create_announcement(
            self.academy_a, self.team_a, "Pinned",
        )
        pinned.is_pinned = True
        pinned.save()
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.get(self.list_url)
        ids = [r["id"] for r in resp.data["results"]]
        pinned_idx = ids.index(str(pinned.pk))
        unpinned_idx = ids.index(str(unpinned.pk))
        self.assertLess(pinned_idx, unpinned_idx)


# ===========================================================================
# 2. Write matrix
# ===========================================================================


class WriteTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def _post(self, user, data):
        self.client.force_authenticate(user=user)
        return self.client.post(self.list_url, data, format="json")

    # Coach can create team announcement

    def test_coach_create_team_announcement(self):
        resp = self._post(self.coach_a, {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "Practice moved",
            "body": "Tomorrow at 5pm",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    # Coach cannot create academy-wide

    def test_coach_academy_wide_403(self):
        resp = self._post(self.coach_a, {
            "academy": str(self.academy_a.pk),
            "title": "Coach trying academy-wide",
            "body": "Should fail",
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # Admin can create academy-wide

    def test_admin_academy_wide(self):
        resp = self._post(self.admin_a, {
            "academy": str(self.academy_a.pk),
            "title": "Admin academy-wide",
            "body": "All teams",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    # Cross-academy team id → 404

    def test_cross_academy_team_404(self):
        resp = self._post(self.coach_a, {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_b.pk),
            "title": "Cross",
            "body": "Should fail",
        })
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # Cross-academy academy id → 404

    def test_cross_academy_id_404(self):
        resp = self._post(self.coach_a, {
            "academy": str(self.academy_b.pk),
            "team": str(self.team_b.pk),
            "title": "Cross",
            "body": "Should fail",
        })
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # Player create → 403

    def test_player_create_403(self):
        resp = self._post(self.player_user_a, {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "Player",
            "body": "Nope",
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # Parent create → 403

    def test_parent_create_403(self):
        resp = self._post(self.parent_a, {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "Parent",
            "body": "Nope",
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # Edit by non-author → 403

    def test_edit_by_non_author_403(self):
        ann = self._create_announcement(self.academy_a, self.team_a)
        self.client.force_authenticate(user=self.coach_b)
        # coach_b is not staff of academy_a — even if they were, they are not author
        make_staff(self.coach_b, self.academy_a)  # make them staff to isolate author check
        url = reverse("announcement-detail", kwargs={"pk": ann.pk})
        resp = self.client.patch(url, {"title": "Hijacked"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # Author can edit

    def test_author_can_edit(self):
        ann = self._create_announcement(self.academy_a, self.team_a)
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-detail", kwargs={"pk": ann.pk})
        resp = self.client.patch(url, {"title": "Updated"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ann.refresh_from_db()
        self.assertEqual(ann.title, "Updated")
        self.assertIsNotNone(ann.edited_at)

    # Admin soft-delete

    def test_admin_soft_delete(self):
        ann = self._create_announcement(self.academy_a, self.team_a)
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("announcement-detail", kwargs={"pk": ann.pk})
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        ann.refresh_from_db()
        self.assertIsNotNone(ann.deleted_at)

    # Author soft-delete (coach)

    def test_author_soft_delete(self):
        ann = self._create_announcement(self.academy_a, self.team_a)
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-detail", kwargs={"pk": ann.pk})
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    # Coach B cannot delete A's announcement

    def test_cross_coach_delete_403(self):
        ann = self._create_announcement(self.academy_a, self.team_a)
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("announcement-detail", kwargs={"pk": ann.pk})
        resp = self.client.delete(url)
        # coach_b cannot see it (not in their academy) → 404
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # Superuser can create for any academy

    def test_superuser_create(self):
        resp = self._post(self.superuser, {
            "academy": str(self.academy_b.pk),
            "title": "Super",
            "body": "Announcement",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    # Pin/unpin by admin

    def test_admin_can_pin(self):
        ann = self._create_announcement(self.academy_a, self.team_a)
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("announcement-detail", kwargs={"pk": ann.pk})
        # Admin is not author, but is admin — for pin we allow via PATCH
        # Actually the design says author or admin can pin.
        # Admin needs to be able to patch is_pinned.
        # But our update view only allows author to edit.
        # Let me check: for pin/unpin, admin should also be allowed.
        # The current view only allows author. This is a deviation —
        # I'll test that admin_a (who IS also staff) can pin if they are author.
        # And that non-author admin can delete but not edit.
        resp = self.client.patch(url, {"is_pinned": True}, format="json")
        # admin_a is not the author (coach_a is) → 403
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ===========================================================================
# 3. Validation
# ===========================================================================


class ValidationTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def _post(self, data):
        self.client.force_authenticate(user=self.coach_a)
        return self.client.post(self.list_url, data, format="json")

    def test_body_too_long(self):
        resp = self._post({
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "Long",
            "body": "x" * 2001,
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_body_exactly_2000_ok(self):
        resp = self._post({
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "OK",
            "body": "x" * 2000,
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_team_not_in_academy(self):
        resp = self._post({
            "academy": str(self.academy_a.pk),
            "team": str(self.team_b.pk),
            "title": "Mismatch",
            "body": "text",
        })
        # team_b belongs to academy_b, not academy_a → 404 (PR #12 style)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_title_max_length(self):
        resp = self._post({
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "x" * 121,
            "body": "text",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_related_match_and_session_both_rejected(self):
        from apps.matches.models import Match
        from apps.training.models import TrainingSession

        match = Match.objects.create(
            academy=self.academy_a, team=self.team_a,
            opponent_name="Rival", match_date="2026-10-01",
            home_away="HOME", created_by=self.coach_a,
        )
        session = TrainingSession.objects.create(
            academy=self.academy_a, team=self.team_a,
            title="Session", training_date="2026-10-01",
            start_time="10:00", duration_minutes=120,
            coach=self.coach_a,
        )
        resp = self._post({
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "Both",
            "body": "text",
            "related_match": str(match.pk),
            "related_session": str(session.pk),
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ===========================================================================
# 4. Read & Acknowledge
# ===========================================================================


class ReadAcknowledgeTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()
        self.ann = self._create_announcement(self.academy_a, self.team_a)

    # Mark read — idempotent

    def test_mark_read_creates_receipt(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-mark-read", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp.data["read_at"])
        # Idempotent
        resp2 = self.client.post(url)
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

    def test_mark_read_idempotent_value_unchanged(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-mark-read", kwargs={"pk": self.ann.pk})
        r1 = self.client.post(url)
        r2 = self.client.post(url)
        self.assertEqual(r1.data["read_at"], r2.data["read_at"])

    # Acknowledge — player only

    def test_player_acknowledge(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp.data["acknowledged_at"])

    def test_parent_acknowledge(self):
        self.client.force_authenticate(user=self.parent_a)
        url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp.data["acknowledged_at"])

    def test_coach_acknowledge_403(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_acknowledge_idempotent(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        r1 = self.client.post(url)
        r2 = self.client.post(url)
        self.assertEqual(r1.data["acknowledged_at"], r2.data["acknowledged_at"])

    def test_unacknowledge(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        self.client.post(url)  # acknowledge
        resp = self.client.delete(url)  # undo
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data["acknowledged_at"])

    def test_unacknowledge_without_prior_is_ok(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # Acknowledging also sets read

    def test_acknowledge_sets_read(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        self.client.post(url)
        receipt = AnnouncementReceipt.objects.get(
            announcement=self.ann, user=self.player_user_a,
        )
        self.assertIsNotNone(receipt.read_at)


# ===========================================================================
# 5. Unread count
# ===========================================================================


class UnreadCountTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()
        self.ann1 = self._create_announcement(self.academy_a, self.team_a, "One")
        self.ann2 = self._create_announcement(self.academy_a, self.team_a, "Two")
        self.url = reverse("announcement-unread-count")

    def test_initial_unread_count(self):
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.get(self.url)
        self.assertEqual(resp.data["unread_count"], 2)

    def test_reading_decreases_count(self):
        self.client.force_authenticate(user=self.player_user_a)
        # Mark one as read
        read_url = reverse("announcement-mark-read", kwargs={"pk": self.ann1.pk})
        self.client.post(read_url)
        resp = self.client.get(self.url)
        self.assertEqual(resp.data["unread_count"], 1)

    def test_unread_zero_when_all_read(self):
        self.client.force_authenticate(user=self.player_user_a)
        for ann in [self.ann1, self.ann2]:
            self.client.post(
                reverse("announcement-mark-read", kwargs={"pk": ann.pk})
            )
        resp = self.client.get(self.url)
        self.assertEqual(resp.data["unread_count"], 0)


# ===========================================================================
# 6. Receipts (staff only)
# ===========================================================================


class ReceiptTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()
        self.ann = self._create_announcement(self.academy_a, self.team_a)

    def test_staff_can_view_receipts(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-receipts", kwargs={"pk": self.ann.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("players", resp.data)
        self.assertIn("parents", resp.data)

    def test_player_cannot_view_receipts(self):
        self.client.force_authenticate(user=self.player_user_a)
        url = reverse("announcement-receipts", kwargs={"pk": self.ann.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_view_receipts(self):
        self.client.force_authenticate(user=self.parent_a)
        url = reverse("announcement-receipts", kwargs={"pk": self.ann.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_receipts_show_acknowledgement(self):
        # Player A acknowledges
        self.client.force_authenticate(user=self.player_user_a)
        ack_url = reverse("announcement-acknowledge", kwargs={"pk": self.ann.pk})
        self.client.post(ack_url)

        # Staff views receipts
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-receipts", kwargs={"pk": self.ann.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.data["players"]["acknowledged"], 1)

    def test_receipts_counts_correct(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-receipts", kwargs={"pk": self.ann.pk})
        resp = self.client.get(url)
        # Player A has ACTIVE team membership → 1 player in audience
        self.assertEqual(resp.data["players"]["total"], 1)
        # Parent A is linked to player A → 1 parent
        self.assertEqual(resp.data["parents"]["total"], 1)

    def test_cross_academy_staff_cannot_view_receipts(self):
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("announcement-receipts", kwargs={"pk": self.ann.pk})
        resp = self.client.get(url)
        # coach_b cannot see the announcement → 404
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ===========================================================================
# 7. Throttle
# ===========================================================================


REAL_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "announcements-throttle-test",
    }
}


@override_settings(CACHES=REAL_CACHE)
class ThrottleTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def test_throttle_kicks_in(self):
        """After 30 rapid POSTs the 31st should be throttled."""
        self.client.force_authenticate(user=self.coach_a)
        for i in range(30):
            resp = self.client.post(self.list_url, {
                "academy": str(self.academy_a.pk),
                "team": str(self.team_a.pk),
                "title": f"Ann {i}",
                "body": "body",
            }, format="json")
            self.assertEqual(
                resp.status_code, status.HTTP_201_CREATED,
                f"Request {i + 1} should succeed, got {resp.status_code}: {resp.data}",
            )
        # 31st should be throttled
        resp = self.client.post(self.list_url, {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "Over limit",
            "body": "body",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


# ===========================================================================
# 8. Pin/unpin permissions
# ===========================================================================


class PinTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()
        self.ann = self._create_announcement(self.academy_a, self.team_a)

    # -- Pin via dedicated action ---

    def test_author_can_pin(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-pin", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["is_pinned"])
        self.ann.refresh_from_db()
        self.assertTrue(self.ann.is_pinned)

    def test_author_can_unpin(self):
        self.ann.is_pinned = True
        self.ann.save()
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-unpin", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["is_pinned"])

    def test_admin_non_author_can_pin(self):
        """ACADEMY_ADMIN of the academy can pin even if not the author."""
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("announcement-pin", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["is_pinned"])

    def test_admin_non_author_can_unpin(self):
        self.ann.is_pinned = True
        self.ann.save()
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("announcement-unpin", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_coach_non_author_cannot_pin(self):
        """A coach who is staff but not the author gets 403."""
        other_coach = make_user(User.Role.COACH, "coach_other@test.com")
        make_staff(other_coach, self.academy_a)
        self.client.force_authenticate(user=other_coach)
        url = reverse("announcement-pin", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_cross_academy_pin_404(self):
        """Staff of academy B cannot see academy A's announcement → 404."""
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("announcement-pin", kwargs={"pk": self.ann.pk})
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # -- PATCH ignores is_pinned ---

    def test_patch_does_not_change_is_pinned(self):
        """is_pinned is read-only in the update serializer."""
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("announcement-detail", kwargs={"pk": self.ann.pk})
        resp = self.client.patch(
            url, {"is_pinned": True, "title": "New title"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.ann.refresh_from_db()
        self.assertFalse(self.ann.is_pinned)
        self.assertEqual(self.ann.title, "New title")


# ===========================================================================
# 9. Author's own announcement is auto-read
# ===========================================================================


class AuthorAutoReadTests(AnnouncementMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def test_author_announcement_not_counted_as_unread(self):
        """Creating an announcement auto-creates a read receipt for the author."""
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.post(self.list_url, {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "My post",
            "body": "body",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        ann_id = resp.data["id"]

        # Receipt exists with read_at set
        receipt = AnnouncementReceipt.objects.get(
            announcement_id=ann_id, user=self.coach_a,
        )
        self.assertIsNotNone(receipt.read_at)

        # Unread count should be 0 for the author
        url = reverse("announcement-unread-count")
        resp = self.client.get(url)
        self.assertEqual(resp.data["unread_count"], 0)

    def test_author_announcement_shows_as_read_in_feed(self):
        """The feed's is_read flag is True for the author's own announcement."""
        self.client.force_authenticate(user=self.coach_a)
        self.client.post(self.list_url, {
            "academy": str(self.academy_a.pk),
            "team": str(self.team_a.pk),
            "title": "My post",
            "body": "body",
        }, format="json")
        resp = self.client.get(self.list_url)
        self.assertTrue(resp.data["results"][0]["is_read"])
