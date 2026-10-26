"""
Tactics tests — covers permission matrix, validation, atomic replace,
version conflict, publish/unpublish, and drawing validation.

Setup mirrors the announcements test pattern:
- Two academies (A and B), each with staff, teams, players.
- Player A is ACTIVE in Academy A / Team A.
- Player B is ACTIVE in Academy B / Team B.
- Player LEFT was ACTIVE in A, then left.
- Parent of A is linked to Player A.
- Parent of B is linked to Player B.
"""

import json
import uuid
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import (
    Academy,
    AcademyStaffMembership,
    PlayerAcademyMembership,
)
from apps.matches.models import Match
from apps.players.models import Player
from apps.teams.models import PlayerTeamMembership, Team
from apps.users.models import ParentPlayerLink, User

from .formations import FORMATIONS, is_valid_formation
from .models import Lineup, LineupSlot
from .validators import validate_drawing


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


def make_match(academy, team, coach) -> Match:
    return Match.objects.create(
        academy=academy, team=team,
        opponent_name="Opponent FC",
        match_date="2026-11-01",
        home_away=Match.HomeAway.HOME,
        created_by=coach,
    )


# ---------------------------------------------------------------------------
# Shared mixin
# ---------------------------------------------------------------------------


class TacticsMixin:
    """Two academies, staff, players, parents, and a match for academy A."""

    def set_up(self):
        # --- Academy A ---
        self.academy_a = make_academy("Academy A")
        self.coach_a = make_user(User.Role.COACH, "coach_a@test.com")
        make_staff(self.coach_a, self.academy_a)
        self.admin_a = make_user(User.Role.ACADEMY_ADMIN, "admin_a@test.com")
        make_staff(self.admin_a, self.academy_a)
        self.team_a = make_team(self.academy_a, "A U15")

        # Players for team A (need enough for lineup tests)
        self.players_a = []
        self.player_users_a = []
        for i in range(15):
            u = make_user(User.Role.PLAYER, f"player_a{i}@test.com")
            p = make_player(f"Player{i}", "Alpha", user=u)
            enroll_player(p, self.academy_a)
            assign_team(p, self.team_a)
            self.players_a.append(p)
            self.player_users_a.append(u)

        self.player_user_a = self.player_users_a[0]
        self.player_a = self.players_a[0]

        # --- Academy B ---
        self.academy_b = make_academy("Academy B")
        self.coach_b = make_user(User.Role.COACH, "coach_b@test.com")
        make_staff(self.coach_b, self.academy_b)
        self.team_b = make_team(self.academy_b, "B U15")

        self.player_user_b = make_user(User.Role.PLAYER, "player_b@test.com")
        self.player_b = make_player("Bob", "Bravo", user=self.player_user_b)
        enroll_player(self.player_b, self.academy_b)
        assign_team(self.player_b, self.team_b)

        # --- Player who LEFT Team A ---
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

        # --- Superuser ---
        self.superuser = make_superuser()

        # --- Match for Academy A ---
        self.match_a = make_match(self.academy_a, self.team_a, self.coach_a)
        self.match_b = make_match(self.academy_b, self.team_b, self.coach_b)

        # --- URLs ---
        self.lineup_url_a = reverse("match-lineup", args=[self.match_a.pk])
        self.lineup_url_b = reverse("match-lineup", args=[self.match_b.pk])
        self.publish_url_a = reverse("match-lineup-publish", args=[self.match_a.pk])
        self.unpublish_url_a = reverse("match-lineup-unpublish", args=[self.match_a.pk])

    def _lineup_payload(self, player_ids=None, game_format=5, formation="2-2",
                        version=0, drawing=None, starters=None, subs=None):
        """Build a valid lineup PUT payload."""
        if player_ids is None:
            player_ids = [self.players_a[i].pk for i in range(4)]

        slots = []
        starter_count = starters if starters is not None else game_format
        for i, pid in enumerate(player_ids):
            if i < starter_count:
                slots.append({
                    "player": str(pid),
                    "role": "STARTER",
                    "x": str(round(0.2 + i * 0.15, 4)),
                    "y": str(round(0.3 + i * 0.1, 4)),
                    "position_code": "CM",
                    "order": i,
                })
            else:
                slots.append({
                    "player": str(pid),
                    "role": "SUBSTITUTE",
                    "order": i,
                })

        return {
            "game_format": game_format,
            "formation": formation,
            "slots": slots,
            "drawing": drawing or [],
            "version": version,
        }


# ===========================================================================
# 1. Permission matrix
# ===========================================================================


class PermissionTests(TacticsMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def _create_lineup(self, match=None, stat=Lineup.Status.DRAFT):
        m = match or self.match_a
        lineup = Lineup.objects.create(
            match=m,
            game_format=5,
            formation="2-2",
            status=stat,
            version=1,
            created_by=self.coach_a,
            updated_by=self.coach_a,
        )
        # Add some slots
        for i in range(4):
            LineupSlot.objects.create(
                lineup=lineup,
                player=self.players_a[i],
                role=LineupSlot.Role.STARTER if i < 3 else LineupSlot.Role.SUBSTITUTE,
                x=Decimal("0.5") if i < 3 else None,
                y=Decimal("0.5") if i < 3 else None,
                order=i,
            )
        return lineup

    # --- Unauthenticated ---

    def test_unauthenticated_get_401(self):
        self._create_lineup()
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_put_401(self):
        resp = self.client.put(self.lineup_url_a, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- Staff DRAFT read ---

    def test_coach_a_reads_draft(self):
        self._create_lineup(stat=Lineup.Status.DRAFT)
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_admin_a_reads_draft(self):
        self._create_lineup(stat=Lineup.Status.DRAFT)
        self.client.force_authenticate(user=self.admin_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superuser_reads_draft(self):
        self._create_lineup(stat=Lineup.Status.DRAFT)
        self.client.force_authenticate(user=self.superuser)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # --- Coach B cannot see Academy A's match (404 from match scoping) ---

    def test_coach_b_gets_404_for_academy_a_match(self):
        self._create_lineup(stat=Lineup.Status.PUBLISHED)
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- Player DRAFT 404 / PUBLISHED 200 ---

    def test_player_a_draft_404(self):
        self._create_lineup(stat=Lineup.Status.DRAFT)
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_player_a_published_200(self):
        self._create_lineup(stat=Lineup.Status.PUBLISHED)
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # --- Player of another team 404 ---

    def test_player_b_published_404(self):
        self._create_lineup(stat=Lineup.Status.PUBLISHED)
        self.client.force_authenticate(user=self.player_user_b)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- Player who LEFT 404 ---

    def test_player_left_published_404(self):
        self._create_lineup(stat=Lineup.Status.PUBLISHED)
        self.client.force_authenticate(user=self.player_user_left)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- Parent of member: published 200 / draft 404 ---

    def test_parent_a_published_200(self):
        self._create_lineup(stat=Lineup.Status.PUBLISHED)
        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_parent_a_draft_404(self):
        self._create_lineup(stat=Lineup.Status.DRAFT)
        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- Parent of non-member 404 ---

    def test_parent_b_academy_a_match_404(self):
        self._create_lineup(stat=Lineup.Status.PUBLISHED)
        self.client.force_authenticate(user=self.parent_b)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_parent_none_404(self):
        self._create_lineup(stat=Lineup.Status.PUBLISHED)
        self.client.force_authenticate(user=self.parent_none)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- Write permissions ---

    def test_coach_a_can_put(self):
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.put(
            self.lineup_url_a,
            self._lineup_payload(),
            format="json",
        )
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))

    def test_player_put_403(self):
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.put(
            self.lineup_url_a,
            self._lineup_payload(),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_put_403(self):
        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.put(
            self.lineup_url_a,
            self._lineup_payload(),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_b_put_academy_a_match_404(self):
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.put(
            self.lineup_url_a,
            self._lineup_payload(),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_superuser_can_put(self):
        self.client.force_authenticate(user=self.superuser)
        resp = self.client.put(
            self.lineup_url_a,
            self._lineup_payload(),
            format="json",
        )
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))

    # --- Delete permissions ---

    def test_coach_a_can_delete(self):
        self._create_lineup()
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.delete(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_player_delete_403(self):
        self._create_lineup()
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.delete(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_delete_403(self):
        self._create_lineup()
        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.delete(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # --- Publish/unpublish permissions ---

    def test_player_publish_403(self):
        self._create_lineup()
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.post(self.publish_url_a)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_publish_403(self):
        self._create_lineup()
        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.post(self.publish_url_a)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ===========================================================================
# 2. Validation tests
# ===========================================================================


class ValidationTests(TacticsMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def _put(self, payload, user=None):
        self.client.force_authenticate(user=user or self.coach_a)
        return self.client.put(self.lineup_url_a, payload, format="json")

    def test_player_not_in_team(self):
        payload = self._lineup_payload(
            player_ids=[self.player_b.pk],
            game_format=5, formation="2-2", starters=1,
        )
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player_not_in_team", json.dumps(resp.data))

    def test_left_member_rejected(self):
        payload = self._lineup_payload(
            player_ids=[self.player_left.pk],
            game_format=5, formation="2-2", starters=1,
        )
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("player_not_in_team", json.dumps(resp.data))

    def test_duplicate_player(self):
        pid = self.players_a[0].pk
        payload = self._lineup_payload()
        payload["slots"] = [
            {"player": str(pid), "role": "STARTER", "x": "0.5", "y": "0.5", "order": 0},
            {"player": str(pid), "role": "SUBSTITUTE", "order": 1},
        ]
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("duplicate_player", json.dumps(resp.data))

    def test_too_many_starters(self):
        pids = [self.players_a[i].pk for i in range(6)]
        payload = self._lineup_payload(player_ids=pids, game_format=5, formation="2-2")
        # All 6 as starters
        payload["slots"] = [
            {"player": str(pid), "role": "STARTER", "x": "0.5", "y": "0.5", "order": i}
            for i, pid in enumerate(pids)
        ]
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("too_many_starters", json.dumps(resp.data))

    def test_invalid_formation_for_format(self):
        payload = self._lineup_payload(game_format=5, formation="4-4-2")
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invalid_formation", json.dumps(resp.data))

    def test_coordinates_out_of_range(self):
        pid = self.players_a[0].pk
        payload = self._lineup_payload()
        payload["slots"] = [
            {"player": str(pid), "role": "STARTER", "x": "1.5", "y": "0.5", "order": 0},
        ]
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_starter_without_coordinates(self):
        pid = self.players_a[0].pk
        payload = self._lineup_payload()
        payload["slots"] = [
            {"player": str(pid), "role": "STARTER", "order": 0},
        ]
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_game_format(self):
        payload = self._lineup_payload(game_format=3, formation="1-1")
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_position_code(self):
        pid = self.players_a[0].pk
        payload = self._lineup_payload()
        payload["slots"] = [
            {"player": str(pid), "role": "STARTER", "x": "0.5", "y": "0.5",
             "position_code": "ZZZ", "order": 0},
        ]
        resp = self._put(payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_blank_position_code_allowed(self):
        pid = self.players_a[0].pk
        payload = self._lineup_payload()
        payload["slots"] = [
            {"player": str(pid), "role": "SUBSTITUTE", "position_code": "", "order": 0},
        ]
        resp = self._put(payload)
        self.assertIn(resp.status_code, (200, 201))


# ===========================================================================
# 3. Drawing validation tests
# ===========================================================================


class DrawingValidationTests(TacticsMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def _put_with_drawing(self, drawing):
        payload = self._lineup_payload(drawing=drawing)
        self.client.force_authenticate(user=self.coach_a)
        return self.client.put(self.lineup_url_a, payload, format="json")

    def test_valid_drawing(self):
        drawing = [
            {"id": "a1", "type": "arrow", "points": [[0.1, 0.2], [0.5, 0.6]],
             "color": "white", "width": "md", "dashed": False},
            {"id": "t1", "type": "text", "at": [0.5, 0.5], "text": "Press!", "color": "yellow"},
        ]
        resp = self._put_with_drawing(drawing)
        self.assertIn(resp.status_code, (200, 201))

    def test_bad_type(self):
        drawing = [{"id": "x", "type": "sparkle", "points": [[0.1, 0.2]]}]
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)

    def test_out_of_range_point(self):
        drawing = [{"id": "a", "type": "arrow", "points": [[0.1, 0.2], [1.5, 0.6]],
                     "color": "white", "width": "md", "dashed": False}]
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)

    def test_unknown_key(self):
        drawing = [{"id": "a", "type": "arrow", "points": [[0.1, 0.2], [0.5, 0.6]],
                     "color": "white", "width": "md", "dashed": False, "glow": True}]
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)

    def test_raw_css_color(self):
        drawing = [{"id": "a", "type": "arrow", "points": [[0.1, 0.2], [0.5, 0.6]],
                     "color": "#ff0000", "width": "md", "dashed": False}]
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)

    def test_too_many_elements(self):
        drawing = [
            {"id": f"e{i}", "type": "line", "points": [[0.1, 0.2], [0.3, 0.4]],
             "color": "white", "width": "sm", "dashed": False}
            for i in range(301)
        ]
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)

    def test_oversized_payload(self):
        # Generate a freehand with many points (but within 500 limit), repeated many times
        big_freehand = {
            "id": "f1", "type": "freehand",
            "points": [[round(i * 0.002, 4), round(i * 0.002, 4)] for i in range(500)],
            "color": "white", "width": "md", "dashed": False,
        }
        # Repeat enough to exceed 100KB
        drawing = [big_freehand] * 20
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)

    def test_text_too_long(self):
        drawing = [{"id": "t", "type": "text", "at": [0.5, 0.5],
                     "text": "x" * 121, "color": "white"}]
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)

    def test_freehand_too_many_points(self):
        drawing = [{"id": "f", "type": "freehand",
                     "points": [[0.1, 0.1]] * 501,
                     "color": "white", "width": "md", "dashed": False}]
        resp = self._put_with_drawing(drawing)
        self.assertEqual(resp.status_code, 400)


# ===========================================================================
# 4. Atomic replace and version conflict
# ===========================================================================


class AtomicReplaceTests(TacticsMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def test_put_creates_lineup(self):
        self.client.force_authenticate(user=self.coach_a)
        payload = self._lineup_payload()
        resp = self.client.put(self.lineup_url_a, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Lineup.objects.count(), 1)
        self.assertEqual(resp.data["version"], 1)

    def test_put_replaces_lineup(self):
        self.client.force_authenticate(user=self.coach_a)
        # Create
        payload = self._lineup_payload(version=0)
        self.client.put(self.lineup_url_a, payload, format="json")

        # Replace with version=1
        new_payload = self._lineup_payload(
            player_ids=[self.players_a[i].pk for i in range(3)],
            game_format=5, formation="1-2-1",
            version=1, starters=4,
        )
        resp = self.client.put(self.lineup_url_a, new_payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["version"], 2)
        self.assertEqual(resp.data["formation"], "1-2-1")

    def test_version_conflict_409(self):
        self.client.force_authenticate(user=self.coach_a)
        payload = self._lineup_payload(version=0)
        self.client.put(self.lineup_url_a, payload, format="json")

        # Send stale version
        resp = self.client.put(
            self.lineup_url_a,
            self._lineup_payload(version=99),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("version_conflict", json.dumps(resp.data))

    def test_version_increments(self):
        self.client.force_authenticate(user=self.coach_a)
        self.client.put(self.lineup_url_a, self._lineup_payload(version=0), format="json")
        resp = self.client.put(self.lineup_url_a, self._lineup_payload(version=1), format="json")
        self.assertEqual(resp.data["version"], 2)
        resp = self.client.put(self.lineup_url_a, self._lineup_payload(version=2), format="json")
        self.assertEqual(resp.data["version"], 3)

    def test_failed_validation_leaves_previous_lineup_intact(self):
        self.client.force_authenticate(user=self.coach_a)
        # Create valid lineup
        payload = self._lineup_payload(version=0)
        self.client.put(self.lineup_url_a, payload, format="json")
        original = Lineup.objects.get(match=self.match_a)
        original_version = original.version
        original_slot_count = original.slots.count()

        # Try invalid update (player not in team)
        bad_payload = self._lineup_payload(version=original_version)
        bad_payload["slots"] = [
            {"player": str(self.player_b.pk), "role": "STARTER",
             "x": "0.5", "y": "0.5", "order": 0},
        ]
        resp = self.client.put(self.lineup_url_a, bad_payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Check lineup unchanged
        original.refresh_from_db()
        self.assertEqual(original.version, original_version)
        self.assertEqual(original.slots.count(), original_slot_count)

    def test_first_put_rejects_nonzero_version(self):
        self.client.force_authenticate(user=self.coach_a)
        payload = self._lineup_payload(version=5)
        resp = self.client.put(self.lineup_url_a, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)


# ===========================================================================
# 5. Publish / Unpublish / Delete
# ===========================================================================


class PublishTests(TacticsMixin, APITestCase):

    def setUp(self):
        self.set_up()

    def test_publish(self):
        self.client.force_authenticate(user=self.coach_a)
        self.client.put(self.lineup_url_a, self._lineup_payload(), format="json")
        resp = self.client.post(self.publish_url_a)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "PUBLISHED")
        self.assertIsNotNone(resp.data["published_at"])

    def test_unpublish(self):
        self.client.force_authenticate(user=self.coach_a)
        self.client.put(self.lineup_url_a, self._lineup_payload(), format="json")
        self.client.post(self.publish_url_a)
        resp = self.client.post(self.unpublish_url_a)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "DRAFT")
        self.assertIsNone(resp.data["published_at"])

    def test_publish_no_lineup_404(self):
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.post(self.publish_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete(self):
        self.client.force_authenticate(user=self.coach_a)
        self.client.put(self.lineup_url_a, self._lineup_payload(), format="json")
        resp = self.client.delete(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Lineup.objects.count(), 0)

    def test_delete_no_lineup_404(self):
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.delete(self.lineup_url_a)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublish_makes_player_lose_access(self):
        """After unpublish, a player who could read published can no longer read."""
        self.client.force_authenticate(user=self.coach_a)
        self.client.put(self.lineup_url_a, self._lineup_payload(), format="json")
        self.client.post(self.publish_url_a)

        # Player can read
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 200)

        # Unpublish
        self.client.force_authenticate(user=self.coach_a)
        self.client.post(self.unpublish_url_a)

        # Player can no longer read
        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)


# ===========================================================================
# 6. Formation constants unit tests
# ===========================================================================


class FormationTests(TestCase):

    def test_all_formats_have_formations(self):
        for fmt in (11, 9, 7, 5):
            self.assertIn(fmt, FORMATIONS)
            self.assertTrue(len(FORMATIONS[fmt]) >= 2)

    def test_is_valid_formation(self):
        self.assertTrue(is_valid_formation(11, "4-4-2"))
        self.assertFalse(is_valid_formation(11, "2-2"))
        self.assertFalse(is_valid_formation(99, "4-4-2"))


# ===========================================================================
# 7. Drawing validator unit tests
# ===========================================================================


class DrawingValidatorUnitTests(TestCase):

    def test_empty_list_valid(self):
        result = validate_drawing([])
        self.assertEqual(result, [])

    def test_not_a_list(self):
        with self.assertRaises(Exception):
            validate_drawing("not a list")

    def test_valid_arrow(self):
        validate_drawing([
            {"id": "a1", "type": "arrow", "points": [[0.1, 0.2], [0.5, 0.6]],
             "color": "white", "width": "md", "dashed": False},
        ])

    def test_valid_ellipse(self):
        validate_drawing([
            {"id": "e1", "type": "ellipse", "center": [0.5, 0.5],
             "rx": 0.1, "ry": 0.2, "color": "red", "width": "lg", "dashed": True},
        ])

    def test_valid_rect(self):
        validate_drawing([
            {"id": "r1", "type": "rect", "origin": [0.1, 0.1],
             "w": 0.3, "h": 0.2, "color": "blue", "width": "sm", "dashed": False},
        ])


# ===========================================================================
# 8. Existence-leak tests — every unauthorized 404 is identical to non-existent
# ===========================================================================


class ExistenceLeakTests(TacticsMixin, APITestCase):
    """
    Every unauthorized read must return a response IDENTICAL to a non-existent
    match id — same status 404, same response body.  Write endpoints against
    out-of-scope matches must also return the same 404.
    """

    def setUp(self):
        self.set_up()
        # Create a DRAFT lineup on match A
        self.client.force_authenticate(user=self.coach_a)
        self.client.put(self.lineup_url_a, self._lineup_payload(), format="json")
        # Also create a PUBLISHED lineup on match A (for player/parent tests)
        self.client.post(self.publish_url_a)

    def _get_nonexistent_response(self, user):
        """GET a truly non-existent match — the canonical 404."""
        fake_url = reverse("match-lineup", args=[uuid.uuid4()])
        self.client.force_authenticate(user=user)
        return self.client.get(fake_url)

    # --- GET read path ---

    def test_read_404_body_identical_across_all_cases(self):
        """
        Compare the 404 body for: non-existent match, staff-B reading A's match,
        player-B reading A's published, player-left reading A's published,
        parent-B reading A's published, parent-none, and match-exists-no-lineup.
        """
        # 1. Non-existent match (canonical 404)
        canonical = self._get_nonexistent_response(self.coach_b)
        self.assertEqual(canonical.status_code, 404)
        canonical_body = canonical.data

        # 2. Staff of academy B reading academy A's match
        self.client.force_authenticate(user=self.coach_b)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_body)

        # 3. Player of another team
        self.client.force_authenticate(user=self.player_user_b)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_body)

        # 4. Player who LEFT the team
        self.client.force_authenticate(user=self.player_user_left)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_body)

        # 5. Parent of non-member
        self.client.force_authenticate(user=self.parent_b)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_body)

        # 6. Parent with no links
        self.client.force_authenticate(user=self.parent_none)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_body)

        # 7. Match exists but no lineup
        match_no_lineup = make_match(self.academy_a, self.team_a, self.coach_a)
        url_no_lineup = reverse("match-lineup", args=[match_no_lineup.pk])
        self.client.force_authenticate(user=self.coach_a)
        resp = self.client.get(url_no_lineup)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_body)

    def test_draft_invisible_to_player_same_body_as_nonexistent(self):
        """Unpublish so it's DRAFT, then player reads — same 404 as nonexistent."""
        self.client.force_authenticate(user=self.coach_a)
        self.client.post(self.unpublish_url_a)

        canonical = self._get_nonexistent_response(self.player_user_a)
        self.assertEqual(canonical.status_code, 404)

        self.client.force_authenticate(user=self.player_user_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical.data)

    def test_draft_invisible_to_parent_same_body_as_nonexistent(self):
        """Unpublish so it's DRAFT, then parent reads — same 404 as nonexistent."""
        self.client.force_authenticate(user=self.coach_a)
        self.client.post(self.unpublish_url_a)

        canonical = self._get_nonexistent_response(self.parent_a)
        self.assertEqual(canonical.status_code, 404)

        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.get(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical.data)

    # --- Write paths: PUT/DELETE/publish/unpublish against out-of-scope match ---

    def test_write_ops_out_of_scope_match_same_404(self):
        """
        PUT, DELETE, POST publish, POST unpublish against academy A's match
        by coach B must all return the same 404 as a non-existent match.
        """
        fake_url = reverse("match-lineup", args=[uuid.uuid4()])
        self.client.force_authenticate(user=self.coach_b)

        # Canonical: PUT to non-existent
        canonical = self.client.put(fake_url, self._lineup_payload(), format="json")
        self.assertEqual(canonical.status_code, 404)
        canonical_body = canonical.data

        # PUT to out-of-scope match
        resp = self.client.put(self.lineup_url_a, self._lineup_payload(), format="json")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_body)

        # DELETE non-existent
        canonical_del = self.client.delete(fake_url)
        self.assertEqual(canonical_del.status_code, 404)

        # DELETE out-of-scope
        resp = self.client.delete(self.lineup_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_del.data)

        # POST publish non-existent
        fake_publish = reverse("match-lineup-publish", args=[uuid.uuid4()])
        canonical_pub = self.client.post(fake_publish)
        self.assertEqual(canonical_pub.status_code, 404)

        # POST publish out-of-scope
        resp = self.client.post(self.publish_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_pub.data)

        # POST unpublish non-existent
        fake_unpublish = reverse("match-lineup-unpublish", args=[uuid.uuid4()])
        canonical_unpub = self.client.post(fake_unpublish)
        self.assertEqual(canonical_unpub.status_code, 404)

        # POST unpublish out-of-scope
        resp = self.client.post(self.unpublish_url_a)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, canonical_unpub.data)
