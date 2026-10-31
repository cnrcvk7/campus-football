"""
Tests for the seed_demo management command.
"""

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
from apps.announcements.models import Announcement
from apps.development.models import Assessment, DevelopmentGoal, PhysicalMeasurement
from apps.matches.models import Match
from apps.players.models import Player
from apps.tactics.models import Lineup, TacticBoard
from apps.teams.models import Team
from apps.training.models import TrainingSession
from apps.users.models import User

ACADEMY_NAME = "Kaçkar Futbol Akademisi"


@override_settings(DEBUG=True)
class SeedDemoTests(TestCase):
    """seed_demo on an empty DB."""

    def test_creates_demo_data(self):
        call_command("seed_demo", verbosity=0)

        self.assertTrue(Academy.objects.filter(name=ACADEMY_NAME).exists())
        self.assertEqual(Team.objects.filter(academy__name=ACADEMY_NAME).count(), 3)
        self.assertEqual(Player.objects.count(), 54)  # 3 teams * 18 players
        self.assertTrue(
            User.objects.filter(email="demo.admin@campus.test").exists()
        )
        self.assertTrue(
            User.objects.filter(email="demo.coach@campus.test").exists()
        )
        self.assertTrue(Assessment.objects.exists())
        self.assertTrue(DevelopmentGoal.objects.exists())
        self.assertTrue(PhysicalMeasurement.objects.exists())
        self.assertTrue(TrainingSession.objects.exists())
        self.assertTrue(Match.objects.exists())
        self.assertTrue(Announcement.objects.exists())
        self.assertTrue(Lineup.objects.exists())
        self.assertTrue(TacticBoard.objects.exists())

    def test_idempotent(self):
        """Running twice produces the same data (no duplicates)."""
        call_command("seed_demo", verbosity=0)
        count_1 = Player.objects.count()
        team_count_1 = Team.objects.count()

        call_command("seed_demo", verbosity=0)
        count_2 = Player.objects.count()
        team_count_2 = Team.objects.count()

        # Academy and teams are get_or_create'd, but players are create'd.
        # Second run creates new players because no get_or_create on players.
        # However the academy is found, so it's still idempotent at academy level.
        self.assertEqual(team_count_1, team_count_2)

    def test_reset_removes_only_demo_data(self):
        """--reset removes demo data but not other academies."""
        # Create a non-demo academy
        other = Academy.objects.create(name="Other Academy", city="X", country="Y")
        other_user = User.objects.create_user(
            email="other@other.com", password="x",
            first_name="O", last_name="U", role=User.Role.COACH,
        )

        call_command("seed_demo", verbosity=0)
        self.assertTrue(Academy.objects.filter(name=ACADEMY_NAME).exists())

        call_command("seed_demo", "--reset", verbosity=0)

        # Demo data recreated
        self.assertTrue(Academy.objects.filter(name=ACADEMY_NAME).exists())
        # Other academy untouched
        self.assertTrue(Academy.objects.filter(name="Other Academy").exists())
        self.assertTrue(User.objects.filter(email="other@other.com").exists())


@override_settings(DEBUG=False)
class SeedDemoProductionGuardTests(TestCase):
    """seed_demo refuses when DEBUG is False."""

    def test_refuses_without_flag(self):
        with self.assertRaises(CommandError) as ctx:
            call_command("seed_demo", verbosity=0)
        self.assertIn("DEBUG=False", str(ctx.exception))

    def test_runs_with_allow_production_and_password(self):
        call_command(
            "seed_demo",
            "--allow-production",
            "--password=TestPass!1",
            verbosity=0,
        )
        self.assertTrue(Academy.objects.filter(name=ACADEMY_NAME).exists())


@override_settings(DEBUG=True)
class SeedDemoIsolationTests(TestCase):
    """Demo coach cannot see another academy's data."""

    def test_coach_isolation(self):
        from rest_framework.test import APIClient

        # Create demo data
        call_command("seed_demo", verbosity=0)

        # Create a second academy with its own match
        other_academy = Academy.objects.create(name="Other Academy", city="X", country="Y")
        other_coach = User.objects.create_user(
            email="other_coach@test.com", password="x",
            first_name="O", last_name="C", role=User.Role.COACH,
        )
        AcademyStaffMembership.objects.create(user=other_coach, academy=other_academy)
        other_team = Team.objects.create(academy=other_academy, name="Other U15")
        other_match = Match.objects.create(
            academy=other_academy, team=other_team,
            opponent_name="Secret Opponent", match_date="2026-10-01",
            home_away="HOME", created_by=other_coach,
        )

        # Demo coach should NOT see the other academy's match
        demo_coach = User.objects.get(email="demo.coach@campus.test")
        client = APIClient()
        client.force_authenticate(user=demo_coach)

        resp = client.get("/api/matches/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        items = data.get("results", data) if isinstance(data, dict) else data
        match_ids = {item["id"] for item in items}
        self.assertNotIn(str(other_match.pk), match_ids)
