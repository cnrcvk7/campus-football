"""
Management command: seed_skills

Populates the Skill table with the initial set of football skills.
Safe to run multiple times — uses get_or_create so no duplicates are created.

Usage:
    python manage.py seed_skills
"""

from django.core.management.base import BaseCommand

from apps.development.models import Skill

INITIAL_SKILLS = [
    # ── Technical ──────────────────────────────────────────────────────────
    {"name": "Passing", "category": "TECHNICAL", "description": "Accuracy and range of passing."},
    {"name": "First Touch", "category": "TECHNICAL", "description": "Control when receiving the ball."},
    {"name": "Dribbling", "category": "TECHNICAL", "description": "Ability to carry the ball past opponents."},
    {"name": "Shooting", "category": "TECHNICAL", "description": "Accuracy and power of shots on goal."},
    {"name": "Crossing", "category": "TECHNICAL", "description": "Delivery of the ball from wide areas."},
    {"name": "Ball Control", "category": "TECHNICAL", "description": "General ability to control and manipulate the ball."},
    {"name": "Weak Foot", "category": "TECHNICAL", "description": "Effectiveness using the non-dominant foot."},
    # ── Tactical ───────────────────────────────────────────────────────────
    {"name": "Positioning", "category": "TACTICAL", "description": "Movement and positioning on the pitch."},
    {"name": "Decision Making", "category": "TACTICAL", "description": "Speed and quality of decisions under pressure."},
    {"name": "Vision", "category": "TACTICAL", "description": "Awareness of options and space around the player."},
    {"name": "Game Understanding", "category": "TACTICAL", "description": "Reading the game and adapting to phases of play."},
    {"name": "Defensive Awareness", "category": "TACTICAL", "description": "Recognition of defensive threats and responsibilities."},
    # ── Physical ───────────────────────────────────────────────────────────
    {"name": "Speed", "category": "PHYSICAL", "description": "Maximum running speed over distance."},
    {"name": "Acceleration", "category": "PHYSICAL", "description": "Ability to reach top speed quickly."},
    {"name": "Agility", "category": "PHYSICAL", "description": "Change of direction speed and coordination."},
    {"name": "Strength", "category": "PHYSICAL", "description": "Physical strength in duels and challenges."},
    {"name": "Endurance", "category": "PHYSICAL", "description": "Ability to maintain performance throughout a match."},
    {"name": "Balance", "category": "PHYSICAL", "description": "Stability when moving with or without the ball."},
    {"name": "Mobility", "category": "PHYSICAL", "description": "Range of movement and flexibility."},
    # ── Mental ─────────────────────────────────────────────────────────────
    {"name": "Discipline", "category": "MENTAL", "description": "Adherence to game plan and tactical instructions."},
    {"name": "Confidence", "category": "MENTAL", "description": "Self-belief in ability and decision making."},
    {"name": "Concentration", "category": "MENTAL", "description": "Focus and attention throughout the match."},
    {"name": "Teamwork", "category": "MENTAL", "description": "Collaborative play and support of teammates."},
    {"name": "Motivation", "category": "MENTAL", "description": "Drive and effort in training and matches."},
]


class Command(BaseCommand):
    help = "Seed the Skill table with the initial set of football skills."

    def handle(self, *args, **options):
        created_count = 0
        skipped_count = 0

        for skill_data in INITIAL_SKILLS:
            _, created = Skill.objects.get_or_create(
                name=skill_data["name"],
                defaults={
                    "category": skill_data["category"],
                    "description": skill_data["description"],
                    "is_active": True,
                },
            )
            if created:
                created_count += 1
            else:
                skipped_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"seed_skills complete: {created_count} created, {skipped_count} already existed."
            )
        )
