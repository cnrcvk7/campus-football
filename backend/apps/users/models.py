import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email: str, password: str | None = None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ACADEMY_ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user account model.

    Separation of concerns
    ──────────────────────
    A User is a login account, not a domain entity.

    A Player is a domain entity that optionally links to a User account via
    a OneToOneField on the Player model. The same approach will be used for
    Coach and Parent profiles when those domains are implemented.

    Role is stored on the User and determined server-side only. The client
    must never be trusted to supply or change its own role.
    """

    class Role(models.TextChoices):
        PLAYER = "PLAYER", "Player"
        PARENT = "PARENT", "Parent"
        COACH = "COACH", "Coach"
        ACADEMY_ADMIN = "ACADEMY_ADMIN", "Academy Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    role = models.CharField(max_length=20, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # grants Django Admin access
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name", "role"]

    class Meta:
        db_table = "users"

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()
