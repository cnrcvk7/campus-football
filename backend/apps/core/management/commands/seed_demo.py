"""
Management command: seed_demo

Creates a complete demo academy with realistic Turkish data for local
development and demos.  Safe to run on production only with --allow-production.
Idempotent: re-running updates the same academy.  --reset deletes and recreates.

Usage:
    python manage.py seed_demo
    python manage.py seed_demo --reset
    python manage.py seed_demo --password MyPass123
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

ACADEMY_NAME = "Kaçkar Futbol Akademisi"

DEMO_EMAILS = [
    "demo.admin@campus.test",
    "demo.coach@campus.test",
    "demo.parent@campus.test",
    "demo.player@campus.test",
]

# ── Turkish player names ─────────────────────────────────────────────────────

FIRST_NAMES_MALE = [
    "Arda", "Burak", "Cem", "Deniz", "Emre", "Furkan", "Gökhan", "Hakan",
    "İlker", "Kaan", "Levent", "Mert", "Nuri", "Oğuz", "Polat", "Rüzgar",
    "Serkan", "Tarık", "Uğur", "Volkan", "Yiğit", "Baran", "Caner",
    "Doruk", "Emir", "Ferhat", "Görkem", "Harun", "İbrahim", "Kağan",
    "Lütfi", "Murat", "Necati", "Onur", "Poyraz", "Rasim", "Selim",
    "Tunç", "Utku", "Veli", "Yavuz", "Batuhan", "Çağrı", "Doğukan",
    "Ensar", "Fatih", "Güneş", "Hüseyin", "İsmail", "Kerem", "Mehmet",
    "Nedim", "Ozan", "Recep", "Sinan",
]

LAST_NAMES = [
    "Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Öztürk", "Aydın",
    "Arslan", "Doğan", "Koç", "Çetin", "Kurt", "Özdemir", "Aksoy",
    "Yıldız", "Korkmaz", "Erdoğan", "Kaplan", "Aslan", "Bulut",
    "Taş", "Güneş", "Polat", "Kılıç", "Bayrak", "Aktaş", "Tuncer",
    "Duman", "Sarı", "Karaca", "Güler", "Tekin", "Bozkurt", "Acar",
    "Başaran", "Demirci", "Gündüz", "Yalçın", "Sezer", "Tanrıverdi",
    "Uysal", "Balcı", "Cengiz", "Dinç", "Erdem", "Fırat", "Gül",
    "Işık", "Kahraman", "Mutlu", "Özkan", "Sevim", "Toprak", "Uzun",
]

# Positions for a balanced squad (18 players per team)
SQUAD_POSITIONS = [
    "GK", "GK",
    "CB", "CB", "CB", "LB", "RB",
    "CDM", "CM", "CM", "CAM",
    "LW", "RW", "LM", "RM",
    "ST", "ST", "CF",
]

# ── Turkish coach comments for assessments ───────────────────────────────────

ASSESSMENT_COMMENTS = [
    "Pas kalitesi artıyor, ayak içi kullanımı çok iyi.",
    "Top kontrolünde gelişme var, baskı altında sakin.",
    "Sprint hızı takımdaki en iyi seviyede.",
    "Taktik anlayışı gelişiyor, pozisyon alma iyileşti.",
    "Savunma geçişlerinde daha dikkatli olmalı.",
    "Şut isabeti yükseldi, sağ ayak kullanımı güçlendi.",
    "Takım oyununa katkısı artıyor, iletişimi çok iyi.",
    "Dayanıklılık testlerinde ilerleme kaydetti.",
    "Dribling becerisi rakiplerine göre üst seviyede.",
    "Konsantrasyonu artmalı, son dakikalarda düşüyor.",
    "Hava toplarında etkili, zamanlama doğru.",
    "Maç okuma becerisi yaşına göre ileri düzeyde.",
    "Özgüveni yüksek, zor anlarda inisiyatif alıyor.",
    "Çalışma disiplini örnek gösterilebilir.",
    "Topu sürerken hız kaybetmiyor, gelişimi iyi.",
]

GOAL_TITLES = [
    ("Pas isabetini %80'e çıkar", "Passing"),
    ("Sprint süresini 0.3 sn düşür", "Speed"),
    ("Şut isabetini artır", "Shooting"),
    ("Haftada 3 ekstra antrenman yap", "Endurance"),
    ("Zayıf ayak kullanımını geliştir", "Weak Foot"),
    ("Savunma pozisyonlarını iyileştir", "Defensive Awareness"),
    ("Top kontrol süresini kısalt", "First Touch"),
    ("Maç okuma yeteneğini geliştir", "Game Understanding"),
]

EXERCISE_DATA = [
    ("Rondo 4v2", "TECHNICAL", 15),
    ("Pas üçgeni", "TECHNICAL", 10),
    ("Şut antrenmanı", "TECHNICAL", 20),
    ("Taktik tahta çalışması", "TACTICAL", 15),
    ("Baskı altında oyun", "TACTICAL", 20),
    ("Sürat koşuları", "PHYSICAL", 10),
    ("Dayanıklılık parkuru", "PHYSICAL", 25),
    ("Isınma ve esneme", "PHYSICAL", 10),
    ("Konsantrasyon oyunu", "MENTAL", 10),
    ("Mini maç", "TACTICAL", 25),
]

OPPONENT_NAMES = [
    "Trabzon Gençlik SK", "Artvin İdman Yurdu", "Fındıklı Spor",
    "Çamlıhemşin FK", "Ardeşen Belediye SK", "Pazar Spor",
    "Hopa Gençlik", "Of Spor", "Sürmene SK",
]

SESSION_TITLES = [
    "Teknik antrenman", "Taktik çalışma", "Fiziksel hazırlık",
    "Maç hazırlığı", "Toparlanma antrenmanı", "Pas ve şut çalışması",
    "Savunma organizasyonu", "Hücum geçişleri", "Set oyunları",
]

ANNOUNCEMENT_DATA = [
    {
        "title": "2026-2027 Sezonu kayıtları başladı",
        "body": (
            "Yeni sezon kayıtlarımız başlamıştır. Tüm velilerin 15 Kasım'a kadar "
            "kayıt formlarını tamamlamaları gerekmektedir. Detaylı bilgi için "
            "akademi sekreterliğine başvurabilirsiniz."
        ),
        "is_pinned": True,
        "team_scoped": False,
    },
    {
        "title": "U15 hafta sonu maç programı",
        "body": (
            "Bu hafta sonu U15 takımımız Trabzon Gençlik SK ile deplasmanda "
            "karşılaşacaktır. Buluşma saati 09:00, akademi otoparkı. "
            "Forma ve kramponlarınızı kontrol edin."
        ),
        "is_pinned": False,
        "team_scoped": True,
    },
    {
        "title": "U15 antrenman saati değişikliği",
        "body": (
            "Saha bakım çalışması nedeniyle bu haftaki Çarşamba antrenmanı "
            "16:00 yerine 17:30'da yapılacaktır. Lütfen programınızı "
            "buna göre ayarlayın."
        ),
        "is_pinned": False,
        "team_scoped": True,
    },
]


class Command(BaseCommand):
    help = "Create a complete demo academy with realistic Turkish data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=None,
            help='Password for demo users (default: "Demo!2026" when DEBUG).',
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing demo data before recreating.",
        )
        parser.add_argument(
            "--allow-production",
            action="store_true",
            help="Allow running when DEBUG is False.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["allow_production"]:
            raise CommandError(
                "Refusing to run with DEBUG=False. "
                "Pass --allow-production to override."
            )

        password = options["password"]
        if password is None:
            if settings.DEBUG:
                password = "Demo!2026"
            else:
                raise CommandError(
                    "You must specify --password when DEBUG is False."
                )

        reset = options["reset"]

        # Use a fixed seed for reproducible but realistic-looking data.
        rng = random.Random(42)

        if reset:
            self._delete_demo_data()

        with transaction.atomic():
            counts = self._create_demo_data(password, rng)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("seed_demo complete:"))
        for label, count in counts.items():
            self.stdout.write(f"  {label}: {count}")
        self.stdout.write("")
        self.stdout.write("Demo accounts:")
        self.stdout.write(f"  Admin:   demo.admin@campus.test  ({password})")
        self.stdout.write(f"  Coach:   demo.coach@campus.test  ({password})")
        self.stdout.write(f"  Parent:  demo.parent@campus.test ({password})")
        self.stdout.write(f"  Player:  demo.player@campus.test ({password})")

    # ── Delete ────────────────────────────────────────────────────────────

    def _delete_demo_data(self):
        from apps.academies.models import Academy
        from apps.users.models import User

        deleted_academy = False
        try:
            academy = Academy.objects.get(name=ACADEMY_NAME)
            # Delete all objects that cascade from the academy.
            # Matches, training sessions, announcements, teams, memberships,
            # invitations, tactic boards, and lineups all cascade.
            # Players are PROTECT — we must delete memberships first, then
            # stats, then assessments/goals/measurements, then players.
            self._delete_academy_cascade(academy)
            deleted_academy = True
        except Academy.DoesNotExist:
            pass

        # Delete demo users
        deleted_users = User.objects.filter(email__in=DEMO_EMAILS).delete()[0]

        if deleted_academy or deleted_users:
            self.stdout.write(
                self.style.WARNING(
                    f"Reset: deleted demo academy "
                    f"({'found' if deleted_academy else 'not found'}), "
                    f"{deleted_users} demo user(s)."
                )
            )

    def _delete_academy_cascade(self, academy):
        """Delete an academy and all related objects, respecting PROTECT FKs."""
        from apps.academies.models import AcademyStaffMembership, PlayerAcademyMembership
        from apps.announcements.models import Announcement
        from apps.development.models import Assessment, DevelopmentGoal, PhysicalMeasurement
        from apps.invitations.models import Invitation
        from apps.matches.models import Match, MatchPlayerStats
        from apps.players.models import Player
        from apps.tactics.models import Lineup, TacticBoard
        from apps.teams.models import PlayerTeamMembership, Team
        from apps.training.models import Exercise, TrainingSession
        from apps.users.models import ParentPlayerLink, User

        # Collect players enrolled at this academy
        player_ids = list(
            PlayerAcademyMembership.objects.filter(academy=academy)
            .values_list("player_id", flat=True)
            .distinct()
        )

        # Collect demo user IDs for PROTECT FK cleanup
        demo_user_ids = list(
            User.objects.filter(email__in=DEMO_EMAILS)
            .values_list("id", flat=True)
        )

        # Delete in dependency order
        Invitation.objects.filter(academy=academy).delete()
        Announcement.objects.filter(academy=academy).delete()

        # Tactics
        match_ids = Match.objects.filter(academy=academy).values_list("id", flat=True)
        Lineup.objects.filter(match_id__in=match_ids).delete()
        TacticBoard.objects.filter(academy=academy).delete()

        # Match stats then matches
        MatchPlayerStats.objects.filter(match__academy=academy).delete()
        Match.objects.filter(academy=academy).delete()

        # Training (sessions cascade exercises links, but Exercise has PROTECT on created_by)
        TrainingSession.objects.filter(academy=academy).delete()

        # Exercises created by demo users (shared library, not academy-scoped,
        # but PROTECT FK on created_by blocks demo user deletion)
        Exercise.objects.filter(created_by_id__in=demo_user_ids).delete()

        # Development data for these players
        Assessment.objects.filter(player_id__in=player_ids).delete()
        DevelopmentGoal.objects.filter(player_id__in=player_ids).delete()
        PhysicalMeasurement.objects.filter(player_id__in=player_ids).delete()

        # Memberships
        PlayerTeamMembership.objects.filter(team__academy=academy).delete()
        PlayerAcademyMembership.objects.filter(academy=academy).delete()
        ParentPlayerLink.objects.filter(player_id__in=player_ids).delete()

        # Teams
        Team.objects.filter(academy=academy).delete()

        # Staff
        AcademyStaffMembership.objects.filter(academy=academy).delete()

        # Players (no other academy should reference these demo players)
        Player.objects.filter(id__in=player_ids).delete()

        # Finally the academy itself
        academy.delete()

    # ── Helpers ────────────────────────────────────────────────────────────

    def _ensure_demo_users(self, password, now):
        """Create or update demo users, always setting the password."""
        from apps.users.models import User

        specs = [
            ("demo.admin@campus.test", "Ayşe", "Yönetici", User.Role.ACADEMY_ADMIN, {}),
            ("demo.coach@campus.test", "Mustafa", "Teknik", User.Role.COACH, {}),
            ("demo.parent@campus.test", "Fatma", "Velioğlu", User.Role.PARENT, {
                "consent_version": "v1.0",
                "consent_accepted_at": now - timedelta(days=60),
            }),
            ("demo.player@campus.test", "Ege", "Velioğlu", User.Role.PLAYER, {
                "consent_version": "v1.0",
                "consent_accepted_at": now - timedelta(days=30),
            }),
        ]
        users = {}
        for email, first, last, role, extra in specs:
            user, _ = User.objects.get_or_create(
                email=email,
                defaults={"first_name": first, "last_name": last, "role": role, **extra},
            )
            user.set_password(password)
            user.save()
            users[email] = user
        return users

    # ── Create ────────────────────────────────────────────────────────────

    def _create_demo_data(self, password, rng):
        from apps.academies.models import Academy, AcademyStaffMembership, PlayerAcademyMembership
        from apps.announcements.models import Announcement, AnnouncementReceipt
        from apps.development.models import (
            Assessment,
            AssessmentItem,
            DevelopmentGoal,
            PhysicalMeasurement,
            Skill,
        )
        from apps.matches.models import Match, MatchPlayerStats
        from apps.players.models import Player
        from apps.tactics.models import Lineup, LineupSlot, TacticBoard
        from apps.teams.models import PlayerTeamMembership, Team
        from apps.training.models import (
            Exercise,
            TrainingAttendance,
            TrainingSession,
            TrainingSessionExercise,
        )
        from apps.users.models import ParentPlayerLink, User

        today = date.today()
        now = timezone.now()
        counts = {}

        # ── Academy ──────────────────────────────────────────────────────
        academy, created = Academy.objects.get_or_create(
            name=ACADEMY_NAME,
            defaults={
                "city": "Rize",
                "country": "Türkiye",
                "description": "Kaçkar Dağları eteklerinde genç yetenekleri keşfeden futbol akademisi.",
                "parental_consent_age": 18,
            },
        )

        # Idempotency: if the academy already has players, just update
        # demo user passwords and return existing counts.
        if not created and PlayerAcademyMembership.objects.filter(academy=academy).exists():
            self._ensure_demo_users(password, now)
            counts["academy"] = 1
            counts["players"] = PlayerAcademyMembership.objects.filter(academy=academy).count()
            counts["teams"] = Team.objects.filter(academy=academy).count()
            counts["note"] = "already seeded — passwords updated"
            return counts

        counts["academy"] = 1

        # ── Skills (ensure they exist) ───────────────────────────────────
        from apps.development.management.commands.seed_skills import INITIAL_SKILLS
        for skill_data in INITIAL_SKILLS:
            Skill.objects.get_or_create(
                name=skill_data["name"],
                defaults={
                    "category": skill_data["category"],
                    "description": skill_data["description"],
                    "is_active": True,
                },
            )
        skills = list(Skill.objects.filter(is_active=True))
        skill_by_name = {s.name: s for s in skills}

        # ── Demo users ───────────────────────────────────────────────────
        demo_users = self._ensure_demo_users(password, now)
        admin_user = demo_users["demo.admin@campus.test"]
        coach_user = demo_users["demo.coach@campus.test"]
        parent_user = demo_users["demo.parent@campus.test"]
        player_user = demo_users["demo.player@campus.test"]
        counts["users"] = 4

        # ── Staff memberships ────────────────────────────────────────────
        AcademyStaffMembership.objects.get_or_create(user=admin_user, academy=academy)
        AcademyStaffMembership.objects.get_or_create(user=coach_user, academy=academy)

        # ── Teams ────────────────────────────────────────────────────────
        team_specs = [
            ("U13", "U-13", 2013, 2014),
            ("U15", "U-15", 2011, 2012),
            ("U17", "U-17", 2009, 2010),
        ]
        teams = {}
        for suffix, age_group, birth_year_start, birth_year_end in team_specs:
            team, _ = Team.objects.get_or_create(
                academy=academy,
                name=f"Kaçkar {suffix}",
                defaults={
                    "age_group": age_group,
                    "gender": "M",
                    "season": "2026-2027",
                },
            )
            teams[suffix] = (team, birth_year_start, birth_year_end)
        counts["teams"] = len(teams)

        # ── Players ──────────────────────────────────────────────────────
        used_names = set()
        all_players = {}  # team_suffix -> list of Player
        jersey_counter = {}
        player_count = 0

        u15_team = teams["U15"][0]
        linked_player = None  # the U15 player linked to demo accounts

        for suffix, (team, by_start, by_end) in teams.items():
            team_players = []
            positions = list(SQUAD_POSITIONS)
            rng.shuffle(positions)
            jersey_counter[suffix] = 1

            for i in range(18):
                # Pick a unique name
                for _ in range(100):
                    fn = rng.choice(FIRST_NAMES_MALE)
                    ln = rng.choice(LAST_NAMES)
                    if (fn, ln) not in used_names:
                        used_names.add((fn, ln))
                        break

                pos = positions[i % len(positions)]
                dob = date(
                    rng.choice([by_start, by_end]),
                    rng.randint(1, 12),
                    rng.randint(1, 28),
                )
                jersey = jersey_counter[suffix]
                jersey_counter[suffix] += 1

                # For the first U15 player, link to demo accounts
                user_link = None
                if suffix == "U15" and i == 0:
                    fn, ln = "Ege", "Velioğlu"
                    used_names.add((fn, ln))
                    user_link = player_user
                    dob = date(2011, 5, 15)
                    pos = "CAM"
                    jersey = 10

                player = Player.objects.create(
                    first_name=fn,
                    last_name=ln,
                    date_of_birth=dob,
                    gender="M",
                    preferred_position=pos,
                    jersey_number=jersey,
                    user=user_link,
                )

                if user_link:
                    # Record parent approval (under-18 player)
                    player.parent_approved_at = now - timedelta(days=55)
                    player.approved_by = parent_user
                    player.save()
                    linked_player = player

                # Academy membership
                PlayerAcademyMembership.objects.create(
                    player=player,
                    academy=academy,
                    joined_at=today - timedelta(days=rng.randint(90, 365)),
                    status=PlayerAcademyMembership.Status.ACTIVE,
                )
                # Team membership
                PlayerTeamMembership.objects.create(
                    player=player,
                    team=team,
                    joined_at=today - timedelta(days=rng.randint(60, 300)),
                    status=PlayerTeamMembership.Status.ACTIVE,
                )

                team_players.append(player)
                player_count += 1

            all_players[suffix] = team_players

        # Parent link
        ParentPlayerLink.objects.get_or_create(
            parent=parent_user,
            player=linked_player,
        )
        counts["players"] = player_count

        # ── U15 Development data ─────────────────────────────────────────
        assessment_count = 0
        goal_count = 0
        measurement_count = 0

        u15_players = all_players["U15"]
        tech_skills = [s for s in skills if s.category == "TECHNICAL"][:4]
        tact_skills = [s for s in skills if s.category == "TACTICAL"][:3]
        phys_skills = [s for s in skills if s.category == "PHYSICAL"][:3]
        ment_skills = [s for s in skills if s.category == "MENTAL"][:2]
        assessment_skills = tech_skills + tact_skills + phys_skills + ment_skills

        for player in u15_players:
            base_score = rng.randint(40, 60)

            # 3-4 assessments over 4 months with upward trend
            num_assessments = rng.randint(3, 4)
            for j in range(num_assessments):
                days_ago = 120 - (j * 30) + rng.randint(-5, 5)
                a_date = today - timedelta(days=max(days_ago, 1))
                comment = rng.choice(ASSESSMENT_COMMENTS)
                assessment = Assessment.objects.create(
                    player=player,
                    coach=coach_user,
                    assessment_date=a_date,
                    overall_comment=comment,
                )
                for skill in assessment_skills:
                    trend = j * rng.randint(2, 5)
                    noise = rng.randint(-3, 3)
                    score = max(1, min(100, base_score + trend + noise))
                    AssessmentItem.objects.create(
                        assessment=assessment,
                        skill=skill,
                        score=score,
                    )
                assessment_count += 1

            # 1-2 goals per player
            num_goals = rng.randint(1, 2)
            for _ in range(num_goals):
                title, skill_name = rng.choice(GOAL_TITLES)
                skill = skill_by_name.get(skill_name)
                is_completed = rng.random() < 0.3
                status = (
                    DevelopmentGoal.Status.COMPLETED
                    if is_completed
                    else DevelopmentGoal.Status.ACTIVE
                )
                start = today - timedelta(days=rng.randint(30, 90))
                goal = DevelopmentGoal.objects.create(
                    player=player,
                    skill=skill,
                    title=title,
                    description=f"{player.first_name} için belirlenen hedef.",
                    target_value=Decimal("80.00") if skill_name != "Speed" else Decimal("4.50"),
                    current_value=(
                        Decimal("80.00") if is_completed
                        else Decimal(str(rng.randint(50, 75)))
                    ),
                    status=status,
                    start_date=start,
                    target_date=start + timedelta(days=60),
                    completed_at=now - timedelta(days=5) if is_completed else None,
                    created_by=coach_user,
                )
                goal_count += 1

            # 2-3 physical measurements over time
            num_measurements = rng.randint(2, 3)
            base_height = Decimal(str(rng.randint(155, 175)))
            base_weight = Decimal(str(rng.randint(45, 65)))
            for k in range(num_measurements):
                days_ago = 90 - (k * 35) + rng.randint(-5, 5)
                m_date = today - timedelta(days=max(days_ago, 1))
                PhysicalMeasurement.objects.create(
                    player=player,
                    measurement_date=m_date,
                    height_cm=base_height + Decimal(str(k * 0.5)),
                    weight_kg=base_weight + Decimal(str(k * 0.3)),
                    sprint_time_seconds=Decimal("5.50") - Decimal(str(k * 0.05)),
                )
                measurement_count += 1

        counts["assessments"] = assessment_count
        counts["goals"] = goal_count
        counts["measurements"] = measurement_count

        # ── Exercises ────────────────────────────────────────────────────
        exercises = []
        for name, category, duration in EXERCISE_DATA:
            ex, _ = Exercise.objects.get_or_create(
                name=name,
                created_by=coach_user,
                defaults={
                    "category": category,
                    "duration_minutes": duration,
                },
            )
            exercises.append(ex)
        counts["exercises"] = len(exercises)

        # ── Training sessions (6 weeks past + 2 weeks future, 2-3/week) ─
        session_count = 0
        attendance_count = 0
        week_start = today - timedelta(weeks=6)

        for week_offset in range(8):
            week_date = week_start + timedelta(weeks=week_offset)
            num_sessions = rng.randint(2, 3)

            for s in range(num_sessions):
                session_date = week_date + timedelta(days=rng.choice([0, 2, 4]))
                title = rng.choice(SESSION_TITLES)
                session = TrainingSession.objects.create(
                    academy=academy,
                    team=u15_team,
                    title=title,
                    training_date=session_date,
                    start_time="16:00",
                    duration_minutes=90,
                    location="Kaçkar Ana Saha",
                    coach=coach_user,
                )

                # Add 2-3 exercises
                chosen_exercises = rng.sample(exercises, min(rng.randint(2, 3), len(exercises)))
                for order, ex in enumerate(chosen_exercises, 1):
                    TrainingSessionExercise.objects.create(
                        session=session,
                        exercise=ex,
                        order=order,
                    )

                # Attendance for past sessions
                if session_date <= today:
                    for player in u15_players:
                        status_choice = rng.choices(
                            ["PRESENT", "PRESENT", "PRESENT", "LATE", "ABSENT", "EXCUSED"],
                            weights=[60, 20, 10, 5, 3, 2],
                        )[0]
                        TrainingAttendance.objects.create(
                            session=session,
                            player=player,
                            status=status_choice,
                        )
                        attendance_count += 1

                session_count += 1

        counts["training_sessions"] = session_count
        counts["attendance_records"] = attendance_count

        # ── Matches (6 past + 3 upcoming) ────────────────────────────────
        match_count = 0
        stats_count = 0
        upcoming_matches = []

        for i in range(9):
            is_past = i < 6
            if is_past:
                m_date = today - timedelta(days=(6 - i) * 7 + rng.randint(-2, 2))
            else:
                m_date = today + timedelta(days=(i - 5) * 7 + rng.randint(-1, 1))

            opponent = rng.choice(OPPONENT_NAMES)
            home_away = rng.choice(["HOME", "AWAY"])

            match = Match.objects.create(
                academy=academy,
                team=u15_team,
                opponent_name=opponent,
                match_date=m_date,
                venue="Rize Şehir Stadyumu" if home_away == "HOME" else f"{opponent} Sahası",
                competition="U15 Bölge Ligi",
                home_away=home_away,
                team_score=rng.randint(0, 4) if is_past else None,
                opponent_score=rng.randint(0, 3) if is_past else None,
                created_by=coach_user,
            )
            match_count += 1

            if not is_past:
                upcoming_matches.append(match)

            # Player stats for past matches
            if is_past:
                starters = rng.sample(u15_players, 11)
                subs_used = rng.sample(
                    [p for p in u15_players if p not in starters],
                    rng.randint(1, 3),
                )
                for player in starters:
                    MatchPlayerStats.objects.create(
                        match=match,
                        player=player,
                        started=True,
                        minutes_played=rng.randint(70, 90),
                        goals=rng.choices([0, 0, 0, 1, 2], weights=[60, 20, 10, 8, 2])[0],
                        assists=rng.choices([0, 0, 1], weights=[70, 20, 10])[0],
                        shots=rng.randint(0, 5),
                        passes_completed=rng.randint(10, 40),
                        tackles=rng.randint(0, 5),
                        yellow_cards=1 if rng.random() < 0.1 else 0,
                        rating=Decimal(str(round(rng.uniform(5.0, 9.0), 1))),
                    )
                    stats_count += 1
                for player in subs_used:
                    MatchPlayerStats.objects.create(
                        match=match,
                        player=player,
                        started=False,
                        minutes_played=rng.randint(10, 30),
                        goals=1 if rng.random() < 0.1 else 0,
                        rating=Decimal(str(round(rng.uniform(5.0, 8.0), 1))),
                    )
                    stats_count += 1

        counts["matches"] = match_count
        counts["match_player_stats"] = stats_count

        # ── Announcements ────────────────────────────────────────────────
        ann_count = 0
        for ann_data in ANNOUNCEMENT_DATA:
            ann = Announcement.objects.create(
                academy=academy,
                team=u15_team if ann_data["team_scoped"] else None,
                author=coach_user,
                title=ann_data["title"],
                body=ann_data["body"],
                is_pinned=ann_data["is_pinned"],
            )

            # Mark as read/acknowledged by demo player and parent
            if ann_data["team_scoped"]:
                AnnouncementReceipt.objects.create(
                    announcement=ann,
                    user=player_user,
                    read_at=now - timedelta(hours=rng.randint(1, 48)),
                    acknowledged_at=now - timedelta(hours=rng.randint(1, 24)),
                )
                AnnouncementReceipt.objects.create(
                    announcement=ann,
                    user=parent_user,
                    read_at=now - timedelta(hours=rng.randint(1, 48)),
                )

            ann_count += 1
        counts["announcements"] = ann_count

        # ── Lineup for next match (published 4-3-3) ──────────────────────
        if upcoming_matches:
            next_match = upcoming_matches[0]
            lineup = Lineup.objects.create(
                match=next_match,
                game_format=11,
                formation="4-3-3",
                status=Lineup.Status.PUBLISHED,
                published_at=now - timedelta(hours=2),
                version=1,
                created_by=coach_user,
                updated_by=coach_user,
            )

            # 4-3-3 positions with (x, y) coordinates on a 0-1 pitch
            formation_positions = [
                ("GK",  Decimal("0.5000"), Decimal("0.9500")),
                ("LB",  Decimal("0.1500"), Decimal("0.7500")),
                ("CB",  Decimal("0.3500"), Decimal("0.8000")),
                ("CB",  Decimal("0.6500"), Decimal("0.8000")),
                ("RB",  Decimal("0.8500"), Decimal("0.7500")),
                ("CM",  Decimal("0.2500"), Decimal("0.5500")),
                ("CM",  Decimal("0.5000"), Decimal("0.5000")),
                ("CM",  Decimal("0.7500"), Decimal("0.5500")),
                ("LW",  Decimal("0.1500"), Decimal("0.2500")),
                ("ST",  Decimal("0.5000"), Decimal("0.2000")),
                ("RW",  Decimal("0.8500"), Decimal("0.2500")),
            ]

            starters = rng.sample(u15_players, 11)
            for order, (pos, x, y) in enumerate(formation_positions):
                LineupSlot.objects.create(
                    lineup=lineup,
                    player=starters[order],
                    role=LineupSlot.Role.STARTER,
                    x=x,
                    y=y,
                    position_code=pos,
                    order=order + 1,
                )

            # 3 substitutes
            remaining = [p for p in u15_players if p not in starters]
            for order, player in enumerate(rng.sample(remaining, 3), 12):
                LineupSlot.objects.create(
                    lineup=lineup,
                    player=player,
                    role=LineupSlot.Role.SUBSTITUTE,
                    order=order,
                )
            counts["lineups"] = 1

        # ── Tactic board with tokens, ball, pen stroke, text ─────────────
        tokens = []
        # Home team tokens (11)
        for i, (pos, x, y) in enumerate(formation_positions):
            tokens.append({
                "id": f"home-{i+1}",
                "type": "home",
                "x": float(x),
                "y": float(y),
                "label": str(i + 1),
            })
        # Away team tokens (4 defenders)
        away_positions = [
            (Decimal("0.3000"), Decimal("0.3500")),
            (Decimal("0.4500"), Decimal("0.3000")),
            (Decimal("0.5500"), Decimal("0.3000")),
            (Decimal("0.7000"), Decimal("0.3500")),
        ]
        for i, (x, y) in enumerate(away_positions):
            tokens.append({
                "id": f"away-{i+1}",
                "type": "away",
                "x": float(x),
                "y": float(y),
                "label": str(i + 1),
            })
        # Ball token
        tokens.append({
            "id": "ball-1",
            "type": "ball",
            "x": 0.50,
            "y": 0.45,
        })

        drawing = [
            {
                "type": "pen",
                "points": [
                    {"x": 0.50, "y": 0.50},
                    {"x": 0.45, "y": 0.40},
                    {"x": 0.40, "y": 0.30},
                ],
                "color": "#ff0000",
                "width": 2,
            },
            {
                "type": "text",
                "x": 0.42,
                "y": 0.28,
                "text": "Baskı yönü",
                "color": "#ff0000",
            },
        ]

        TacticBoard.objects.create(
            academy=academy,
            team=u15_team,
            title="Yüksek baskı planı",
            game_format=11,
            tokens=tokens,
            drawing=drawing,
            version=1,
            created_by=coach_user,
            updated_by=coach_user,
        )
        counts["tactic_boards"] = 1

        return counts
