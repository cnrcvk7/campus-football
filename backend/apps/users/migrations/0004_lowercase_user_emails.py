"""
Data migration: lowercase all existing User.email values.

If lowercasing would create duplicates (two rows map to the same email),
the migration fails with a clear message listing the collisions.
No rows are modified in that case.
"""
from django.db import migrations


def lowercase_emails(apps, schema_editor):
    User = apps.get_model("users", "User")

    # Detect collisions: group by lowercased email, find any with count > 1
    from django.db.models import Count
    from django.db.models.functions import Lower

    collisions = (
        User.objects
        .annotate(lower_email=Lower("email"))
        .values("lower_email")
        .annotate(cnt=Count("id"))
        .filter(cnt__gt=1)
    )
    if collisions.exists():
        details = []
        for row in collisions:
            conflicting = User.objects.filter(
                email__iexact=row["lower_email"]
            ).values_list("id", "email")
            for uid, email in conflicting:
                details.append(f"  {uid}  {email}")
        raise RuntimeError(
            "Cannot lowercase emails: the following users would collide.\n"
            "Resolve manually before migrating.\n"
            + "\n".join(details)
        )

    # Safe to proceed — lowercase every email in-place
    for user in User.objects.all().iterator():
        lowered = user.email.lower()
        if lowered != user.email:
            user.email = lowered
            user.save(update_fields=["email"])


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_alter_parentplayerlink_unique_together_and_more"),
    ]

    operations = [
        migrations.RunPython(lowercase_emails, migrations.RunPython.noop),
    ]
