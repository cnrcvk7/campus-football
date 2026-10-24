"""
Cross-academy isolation tests.

Verifies strict academy scoping for academies, teams, players, training
sessions and matches.  Also covers player creation (academy required),
academy creation (auto staff membership), orphan player protection, and
superuser bypass behaviour.

Setup: two academies (A and B), each with a coach-staff member, a player
enrolled via PlayerAcademyMembership and a team.  An additional coach with
zero staff memberships, and a player with zero memberships.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.players.models import Player
from apps.teams.models import PlayerTeamMembership, Team
from apps.users.models import User


# ---------------------------------------------------------------------------
# Shared helpers — same style as existing test modules
# ---------------------------------------------------------------------------


def make_user(role, email, password="testpass123", **extra) -> User:
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="Test",
        last_name="User",
        role=role,
        **extra,
    )


def make_superuser(email="super@test.com") -> User:
    return User.objects.create_superuser(
        email=email,
        password="testpass123",
        first_name="Super",
        last_name="Admin",
    )


def make_academy(name) -> Academy:
    return Academy.objects.create(name=name, city="City", country="Country")


def make_team(academy, name) -> Team:
    return Team.objects.create(academy=academy, name=name)


def make_player(first_name="Test", last_name="Player", user=None) -> Player:
    p = Player.objects.create(
        first_name=first_name,
        last_name=last_name,
        date_of_birth="2008-01-01",
        gender="M",
    )
    if user is not None:
        p.user = user
        p.save()
    return p


def make_staff(user, academy) -> AcademyStaffMembership:
    return AcademyStaffMembership.objects.create(user=user, academy=academy)


def enroll_player(player, academy) -> PlayerAcademyMembership:
    return PlayerAcademyMembership.objects.create(
        player=player, academy=academy, joined_at="2026-01-01",
    )


def assign_team(player, team) -> PlayerTeamMembership:
    return PlayerTeamMembership.objects.create(
        player=player, team=team, joined_at="2026-01-01",
    )


VALID_PLAYER_DATA = {
    "first_name": "New",
    "last_name": "Player",
    "date_of_birth": "2010-05-20",
    "gender": "M",
}


# ---------------------------------------------------------------------------
# Shared fixture mixin
# ---------------------------------------------------------------------------


class TwoAcademyMixin:
    """
    Creates two academies, each with a coach (staff member), a team, and a
    player enrolled in that academy.  Also creates:
      - coach_none: a coach with no staff memberships
      - player_orphan: a player with zero academy or team memberships
      - admin_a: an ACADEMY_ADMIN who is staff of Academy A
    """

    def set_up_two_academies(self):
        # Academy A
        self.academy_a = make_academy("Academy A")
        self.coach_a = make_user(User.Role.COACH, "coach_a@test.com")
        make_staff(self.coach_a, self.academy_a)
        self.team_a = make_team(self.academy_a, "A U15")
        self.player_a = make_player("Alice", "Alpha")
        enroll_player(self.player_a, self.academy_a)
        assign_team(self.player_a, self.team_a)

        # Academy B
        self.academy_b = make_academy("Academy B")
        self.coach_b = make_user(User.Role.COACH, "coach_b@test.com")
        make_staff(self.coach_b, self.academy_b)
        self.team_b = make_team(self.academy_b, "B U15")
        self.player_b = make_player("Bob", "Bravo")
        enroll_player(self.player_b, self.academy_b)
        assign_team(self.player_b, self.team_b)

        # Coach with no memberships
        self.coach_none = make_user(User.Role.COACH, "coach_none@test.com")

        # ACADEMY_ADMIN of A
        self.admin_a = make_user(User.Role.ACADEMY_ADMIN, "admin_a@test.com")
        make_staff(self.admin_a, self.academy_a)

        # Player with no academy/team memberships
        self.player_orphan = make_player("Orphan", "Player")

        # Superuser
        self.superuser = make_superuser()


# ===========================================================================
# 1. Academies list/retrieve scoping
# ===========================================================================

class AcademyCrossAcademyListTests(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        self.list_url = reverse("academy-list")

    def test_coach_a_sees_only_own_academy_in_list(self):
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.academy_a.pk), ids)
        self.assertNotIn(str(self.academy_b.pk), ids)

    def test_coach_a_cannot_retrieve_academy_b(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("academy-detail", kwargs={"pk": self.academy_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_superuser_can_list_all_academies(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.academy_a.pk), ids)
        self.assertIn(str(self.academy_b.pk), ids)

    def test_superuser_can_retrieve_any_academy(self):
        self.client.force_authenticate(user=self.superuser)
        for academy in (self.academy_a, self.academy_b):
            url = reverse("academy-detail", kwargs={"pk": academy.pk})
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 2. Teams list/retrieve scoping
# ===========================================================================

class TeamCrossAcademyListTests(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        self.list_url = reverse("team-list")

    def test_coach_a_sees_only_own_academy_teams(self):
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.team_a.pk), ids)
        self.assertNotIn(str(self.team_b.pk), ids)

    def test_coach_a_cannot_retrieve_team_b(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("team-detail", kwargs={"pk": self.team_b.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_superuser_can_list_all_teams(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.team_a.pk), ids)
        self.assertIn(str(self.team_b.pk), ids)

    def test_superuser_can_retrieve_any_team(self):
        self.client.force_authenticate(user=self.superuser)
        for team in (self.team_a, self.team_b):
            url = reverse("team-detail", kwargs={"pk": team.pk})
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 3. Players list scoping
# ===========================================================================

class PlayerCrossAcademyListTests(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        self.list_url = reverse("player-list")

    def test_coach_a_sees_only_own_academy_players(self):
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.player_a.pk), ids)
        self.assertNotIn(str(self.player_b.pk), ids)

    def test_coach_a_cannot_see_orphan_player(self):
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url)
        ids = [r["id"] for r in response.data["results"]]
        self.assertNotIn(str(self.player_orphan.pk), ids)

    def test_superuser_can_list_all_players(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.player_a.pk), ids)
        self.assertIn(str(self.player_b.pk), ids)
        self.assertIn(str(self.player_orphan.pk), ids)


# ===========================================================================
# 4. Player create — academy required
# ===========================================================================

class PlayerCreateAcademyTests(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        self.create_url = reverse("player-list")

    # --- Single academy default ---

    def test_coach_single_academy_defaults_without_explicit_academy(self):
        """Coach with exactly one academy: omit academy, it defaults."""
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.post(self.create_url, VALID_PLAYER_DATA, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Verify membership was created
        player_id = response.data["id"]
        self.assertTrue(
            PlayerAcademyMembership.objects.filter(
                player_id=player_id, academy=self.academy_a,
            ).exists()
        )

    def test_coach_single_academy_explicit_academy_works(self):
        """Coach with one academy can also specify it explicitly."""
        self.client.force_authenticate(user=self.coach_a)
        payload = {**VALID_PLAYER_DATA, "academy": str(self.academy_a.pk)}
        response = self.client.post(self.create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # --- Multiple academies ---

    def test_coach_multiple_academies_must_specify(self):
        """Coach with two academies must specify one; omitting returns 400."""
        make_staff(self.coach_a, self.academy_b)
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.post(self.create_url, VALID_PLAYER_DATA, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("academy", response.data)

    def test_coach_multiple_academies_explicit_works(self):
        """Coach with two academies can specify one explicitly."""
        make_staff(self.coach_a, self.academy_b)
        self.client.force_authenticate(user=self.coach_a)
        payload = {**VALID_PLAYER_DATA, "academy": str(self.academy_b.pk)}
        response = self.client.post(self.create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        player_id = response.data["id"]
        self.assertTrue(
            PlayerAcademyMembership.objects.filter(
                player_id=player_id, academy=self.academy_b,
            ).exists()
        )

    # --- No memberships ---

    def test_coach_no_memberships_returns_403(self):
        self.client.force_authenticate(user=self.coach_none)
        response = self.client.post(self.create_url, VALID_PLAYER_DATA, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- Wrong academy ---

    def test_coach_a_cannot_create_in_academy_b(self):
        self.client.force_authenticate(user=self.coach_a)
        payload = {**VALID_PLAYER_DATA, "academy": str(self.academy_b.pk)}
        response = self.client.post(self.create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- Superuser ---

    def test_superuser_must_specify_academy(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.post(self.create_url, VALID_PLAYER_DATA, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_superuser_can_create_with_explicit_academy(self):
        self.client.force_authenticate(user=self.superuser)
        payload = {**VALID_PLAYER_DATA, "academy": str(self.academy_a.pk)}
        response = self.client.post(self.create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        player_id = response.data["id"]
        self.assertTrue(
            PlayerAcademyMembership.objects.filter(
                player_id=player_id, academy=self.academy_a,
            ).exists()
        )

    # --- Membership is atomic ---

    def test_membership_created_atomically(self):
        """Player and membership are created in one transaction."""
        self.client.force_authenticate(user=self.coach_a)
        before_players = Player.objects.count()
        before_memberships = PlayerAcademyMembership.objects.count()
        response = self.client.post(self.create_url, VALID_PLAYER_DATA, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Player.objects.count(), before_players + 1)
        self.assertEqual(PlayerAcademyMembership.objects.count(), before_memberships + 1)

    # --- PLAYER/PARENT cannot create ---

    def test_player_role_cannot_create(self):
        player_user = make_user(User.Role.PLAYER, "playerrole@test.com")
        self.client.force_authenticate(user=player_user)
        response = self.client.post(self.create_url, VALID_PLAYER_DATA, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_role_cannot_create(self):
        parent_user = make_user(User.Role.PARENT, "parentrole@test.com")
        self.client.force_authenticate(user=parent_user)
        response = self.client.post(self.create_url, VALID_PLAYER_DATA, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ===========================================================================
# 5. Orphan player write protection
# ===========================================================================

class OrphanPlayerWriteTests(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        self.orphan_url = reverse("player-detail", kwargs={"pk": self.player_orphan.pk})

    def test_coach_a_cannot_patch_orphan(self):
        """Orphan is not in coach A's queryset → 404 (invisible)."""
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.patch(self.orphan_url, {"last_name": "X"}, format="json")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_coach_none_cannot_patch_orphan(self):
        """Coach with no memberships has empty queryset → 404."""
        self.client.force_authenticate(user=self.coach_none)
        response = self.client.patch(self.orphan_url, {"last_name": "X"}, format="json")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_coach_b_cannot_patch_orphan(self):
        """Orphan is not in coach B's queryset → 404 (invisible)."""
        self.client.force_authenticate(user=self.coach_b)
        response = self.client.patch(self.orphan_url, {"last_name": "X"}, format="json")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_superuser_can_patch_orphan(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.patch(self.orphan_url, {"last_name": "Fixed"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["last_name"], "Fixed")


# ===========================================================================
# 6. Training session PATCH isolation + superuser bypass
# ===========================================================================

class TrainingSessionPatchIsolationTests(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        from apps.training.models import TrainingSession
        self.session_a = TrainingSession.objects.create(
            academy=self.academy_a, team=self.team_a,
            title="Session A", training_date="2026-10-20", coach=self.coach_a,
        )
        self.session_b = TrainingSession.objects.create(
            academy=self.academy_b, team=self.team_b,
            title="Session B", training_date="2026-10-20", coach=self.coach_b,
        )

    def test_coach_a_cannot_patch_session_b(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("training-session-detail", args=[self.session_b.pk])
        response = self.client.patch(url, {"title": "Hacked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_a_can_patch_own_session(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("training-session-detail", args=[self.session_a.pk])
        response = self.client.patch(url, {"title": "Updated"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_coach_none_gets_404(self):
        self.client.force_authenticate(user=self.coach_none)
        url = reverse("training-session-detail", args=[self.session_a.pk])
        response = self.client.patch(url, {"title": "Hacked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_superuser_can_list_all_sessions(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("training-session-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.session_a.pk), ids)
        self.assertIn(str(self.session_b.pk), ids)

    def test_superuser_can_patch_any_session(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("training-session-detail", args=[self.session_a.pk])
        response = self.client.patch(url, {"title": "SuperUpdate"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ===========================================================================
# 7. Match queryset superuser bypass
# ===========================================================================

class MatchSuperuserTests(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        from apps.matches.models import Match
        self.match_a = Match.objects.create(
            academy=self.academy_a, team=self.team_a,
            opponent_name="Rival A", match_date="2026-10-01",
            home_away="HOME", created_by=self.coach_a,
        )
        self.match_b = Match.objects.create(
            academy=self.academy_b, team=self.team_b,
            opponent_name="Rival B", match_date="2026-10-02",
            home_away="AWAY", created_by=self.coach_b,
        )

    def test_superuser_can_list_all_matches(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("match-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.match_a.pk), ids)
        self.assertIn(str(self.match_b.pk), ids)

    def test_coach_a_cannot_see_match_b(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("match-list")
        response = self.client.get(url)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.match_a.pk), ids)
        self.assertNotIn(str(self.match_b.pk), ids)


# ===========================================================================
# 8. Academy creation auto-creates staff membership
# ===========================================================================

class AcademyCreateStaffMembershipTests(APITestCase):

    def setUp(self):
        self.admin = make_user(User.Role.ACADEMY_ADMIN, "creator@test.com")
        self.superuser = make_superuser()
        self.list_url = reverse("academy-list")

    def test_admin_sees_new_academy_after_creation(self):
        """After creating an academy, the admin should see it in the list."""
        self.client.force_authenticate(user=self.admin)
        payload = {"name": "New Academy", "city": "London", "country": "UK"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        academy_id = response.data["id"]
        # Staff membership was auto-created
        self.assertTrue(
            AcademyStaffMembership.objects.filter(
                user=self.admin, academy_id=academy_id,
            ).exists()
        )
        # Admin can see it in the list
        list_response = self.client.get(self.list_url)
        ids = [r["id"] for r in list_response.data["results"]]
        self.assertIn(academy_id, ids)

    def test_superuser_create_does_not_auto_create_membership(self):
        """Superuser bypasses scoping, no auto membership needed."""
        self.client.force_authenticate(user=self.superuser)
        payload = {"name": "Super Academy", "city": "London", "country": "UK"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        academy_id = response.data["id"]
        self.assertFalse(
            AcademyStaffMembership.objects.filter(
                user=self.superuser, academy_id=academy_id,
            ).exists()
        )


# ===========================================================================
# 9. Match history academy scoping baseline
# ===========================================================================

class MatchHistoryAcademyScopingTest(TwoAcademyMixin, APITestCase):

    def setUp(self):
        self.set_up_two_academies()
        from apps.matches.models import Match, MatchPlayerStats
        self.match_a = Match.objects.create(
            academy=self.academy_a, team=self.team_a,
            opponent_name="Rival A", match_date="2026-10-01",
            home_away="HOME", created_by=self.coach_a,
        )
        MatchPlayerStats.objects.create(match=self.match_a, player=self.player_a, goals=2)
        # Cross-enroll player_a in Academy B
        enroll_player(self.player_a, self.academy_b)
        self.match_b = Match.objects.create(
            academy=self.academy_b, team=self.team_b,
            opponent_name="Rival B", match_date="2026-10-02",
            home_away="AWAY", created_by=self.coach_b,
        )
        MatchPlayerStats.objects.create(match=self.match_b, player=self.player_a, goals=1)

    def test_coach_a_sees_only_own_academy_match_history(self):
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-match-history", args=[self.player_a.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        opponents = [m["opponent"] for m in response.data["matches"]]
        self.assertIn("Rival A", opponents)
        self.assertNotIn("Rival B", opponents)

    def test_superuser_sees_all_match_history(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("player-match-history", args=[self.player_a.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        opponents = [m["opponent"] for m in response.data["matches"]]
        self.assertIn("Rival A", opponents)
        self.assertIn("Rival B", opponents)


# ===========================================================================
# 10. Deduplication: player enrolled in two academies the same coach staffs
# ===========================================================================

class PlayerListDeduplicationTests(APITestCase):
    """
    A player enrolled in two academies that the same coach is staff of must
    appear exactly once in the player list.
    """

    def setUp(self):
        self.academy_a = make_academy("Dedup A")
        self.academy_b = make_academy("Dedup B")
        self.coach = make_user(User.Role.COACH, "dedup_coach@test.com")
        make_staff(self.coach, self.academy_a)
        make_staff(self.coach, self.academy_b)
        self.player = make_player("Charlie", "Cross")
        enroll_player(self.player, self.academy_a)
        enroll_player(self.player, self.academy_b)
        self.list_url = reverse("player-list")

    def test_player_appears_once(self):
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertEqual(ids.count(str(self.player.pk)), 1)

    def test_player_with_historical_re_enrollment_appears_once(self):
        """Player left academy A and re-enrolled — still one row."""
        # Mark first membership as left, create a second active one
        first = PlayerAcademyMembership.objects.filter(
            player=self.player, academy=self.academy_a,
        ).first()
        first.status = PlayerAcademyMembership.Status.LEFT
        first.left_at = "2026-06-01"
        first.save()
        PlayerAcademyMembership.objects.create(
            player=self.player, academy=self.academy_a, joined_at="2026-07-01",
        )
        self.client.force_authenticate(user=self.coach)
        response = self.client.get(self.list_url)
        ids = [r["id"] for r in response.data["results"]]
        self.assertEqual(ids.count(str(self.player.pk)), 1)


# ===========================================================================
# 11. Membership history: player left academy → coach can still see them
#     (consistent with existing append-only design)
# ===========================================================================

class PlayerLeftAcademyVisibilityTests(TwoAcademyMixin, APITestCase):
    """
    Players who left an academy remain VISIBLE to that academy's staff but
    are no longer WRITABLE.  Only staff of an academy where the player has
    an ACTIVE PlayerAcademyMembership may perform writes.
    """

    def setUp(self):
        self.set_up_two_academies()
        self.list_url = reverse("player-list")
        # Enroll player_a in Academy B as well (ACTIVE) so coach B can write.
        enroll_player(self.player_a, self.academy_b)

    def _leave_academy(self, player, academy):
        """Mark the player's membership in this academy as left."""
        m = PlayerAcademyMembership.objects.get(player=player, academy=academy)
        m.status = PlayerAcademyMembership.Status.LEFT
        m.left_at = "2026-09-01"
        m.save()

    # -- READ: coach of LEFT academy can still see the player ---------------

    def test_coach_still_sees_player_after_they_left(self):
        """Player A leaves Academy A; coach A still sees them in the list."""
        self._leave_academy(self.player_a, self.academy_a)
        self.client.force_authenticate(user=self.coach_a)
        response = self.client.get(self.list_url)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.player_a.pk), ids)

    def test_coach_b_still_cannot_see_player_a_after_leaving(self):
        """Player A leaves both academies; coach B still can't see them
        (player_a left B too, so no membership at all with B… but we only
        leave A in this test; B is still active)."""
        self._leave_academy(self.player_a, self.academy_a)
        # coach_b CAN see player_a because player_a is now ACTIVE in B.
        self.client.force_authenticate(user=self.coach_b)
        response = self.client.get(self.list_url)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(str(self.player_a.pk), ids)

    # -- WRITE: coach of LEFT academy gets 403 on PATCH ---------------------

    def test_coach_cannot_patch_player_after_they_left(self):
        """Player A leaves Academy A; coach A gets 403 on PATCH."""
        self._leave_academy(self.player_a, self.academy_a)
        self.client.force_authenticate(user=self.coach_a)
        url = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        response = self.client.patch(url, {"last_name": "Updated"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_coach_of_active_academy_can_patch(self):
        """Player A left A but is ACTIVE in B; coach B can PATCH."""
        self._leave_academy(self.player_a, self.academy_a)
        self.client.force_authenticate(user=self.coach_b)
        url = reverse("player-detail", kwargs={"pk": self.player_a.pk})
        response = self.client.patch(url, {"last_name": "Updated"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # -- WRITE: nested development endpoint (measurement create) -------------

    def test_coach_cannot_create_measurement_after_player_left(self):
        """Coach A cannot POST a measurement for player A after they left A."""
        self._leave_academy(self.player_a, self.academy_a)
        self.client.force_authenticate(user=self.coach_a)
        url = reverse(
            "player-measurement-list",
            kwargs={"player_pk": self.player_a.pk},
        )
        payload = {"measurement_date": "2026-10-01", "height_cm": "175.00"}
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
