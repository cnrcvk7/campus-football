import sys

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.academies.models import Academy
from apps.invitations.models import Invitation, generate_invitation_token, hash_token
from apps.users.models import User

from django.utils import timezone
from datetime import timedelta


class Command(BaseCommand):
    help = "Create a one-time ACADEMY_ADMIN invitation link for an academy."

    def add_arguments(self, parser):
        parser.add_argument(
            "--academy",
            required=True,
            help="Name of the academy (exact match).",
        )
        parser.add_argument(
            "--create",
            action="store_true",
            help="Create the academy if it does not exist.",
        )

    def handle(self, *args, **options):
        academy_name = options["academy"]

        try:
            academy = Academy.objects.get(name=academy_name)
        except Academy.DoesNotExist:
            if options["create"]:
                academy = Academy.objects.create(name=academy_name)
                self.stdout.write(f"Created academy: {academy_name}")
            else:
                raise CommandError(
                    f'Academy "{academy_name}" does not exist. '
                    f"Use --create to create it."
                )

        # Use the first superuser as created_by, or fail
        superuser = User.objects.filter(is_superuser=True).first()
        if superuser is None:
            raise CommandError(
                "No superuser found. Create one with: "
                "python manage.py createsuperuser"
            )

        plain_token = generate_invitation_token()
        now = timezone.now()
        invitation = Invitation.objects.create(
            token_hash=hash_token(plain_token),
            role=Invitation.Role.ACADEMY_ADMIN,
            academy=academy,
            player=None,
            email_hint="",
            created_by=superuser,
            expires_at=now + timedelta(days=7),
        )

        frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173")
        invite_link = f"{frontend_base}/invite/{plain_token}"

        self.stdout.write("")
        self.stdout.write(f"Academy:    {academy.name}")
        self.stdout.write(f"Role:       ACADEMY_ADMIN")
        self.stdout.write(f"Expires:    {invitation.expires_at.isoformat()}")
        self.stdout.write(f"Invite ID:  {invitation.id}")
        self.stdout.write("")
        self.stdout.write(f"Invitation link (share this — shown only once):")
        self.stdout.write(f"  {invite_link}")
        self.stdout.write("")
