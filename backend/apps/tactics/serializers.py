from rest_framework import serializers

from apps.players.models import Player

from .formations import is_valid_formation
from .models import Lineup, LineupSlot
from .validators import validate_drawing


class LineupSlotReadSerializer(serializers.ModelSerializer):
    player_id = serializers.UUIDField(source="player.id")
    first_name = serializers.CharField(source="player.first_name")
    last_name = serializers.CharField(source="player.last_name")
    preferred_position = serializers.CharField(source="player.preferred_position")
    jersey_number = serializers.IntegerField(source="player.jersey_number")

    class Meta:
        model = LineupSlot
        fields = [
            "id",
            "player_id",
            "first_name",
            "last_name",
            "preferred_position",
            "jersey_number",
            "role",
            "x",
            "y",
            "position_code",
            "order",
        ]


class LineupReadSerializer(serializers.ModelSerializer):
    slots = LineupSlotReadSerializer(many=True, read_only=True)

    class Meta:
        model = Lineup
        fields = [
            "id",
            "match",
            "game_format",
            "formation",
            "status",
            "published_at",
            "drawing",
            "version",
            "slots",
            "created_at",
            "updated_at",
        ]


_VALID_POSITION_CODES = {c[0] for c in Player.Position.choices}


class SlotWriteSerializer(serializers.Serializer):
    """Inline slot data for the PUT payload."""
    player = serializers.UUIDField()
    role = serializers.ChoiceField(choices=LineupSlot.Role.choices)
    x = serializers.DecimalField(max_digits=5, decimal_places=4, required=False, allow_null=True)
    y = serializers.DecimalField(max_digits=5, decimal_places=4, required=False, allow_null=True)
    position_code = serializers.CharField(required=False, default="", allow_blank=True)
    order = serializers.IntegerField(required=False, default=0)

    def validate_position_code(self, value):
        if value and value not in _VALID_POSITION_CODES:
            raise serializers.ValidationError(
                f"Invalid position code: {value}. "
                f"Allowed: {', '.join(sorted(_VALID_POSITION_CODES))} or blank."
            )
        return value


class LineupWriteSerializer(serializers.Serializer):
    """
    PUT /api/matches/{id}/lineup/

    Replaces the entire lineup atomically.
    """
    game_format = serializers.IntegerField()
    formation = serializers.CharField(max_length=20)
    slots = SlotWriteSerializer(many=True)
    drawing = serializers.ListField(child=serializers.DictField(), default=list)
    version = serializers.IntegerField(required=False, default=0)

    def validate_game_format(self, value):
        from .formations import FORMATIONS
        if value not in FORMATIONS:
            raise serializers.ValidationError(
                f"Invalid game format: {value}. Allowed: {sorted(FORMATIONS.keys())}."
            )
        return value

    def validate(self, data):
        game_format = data.get("game_format")
        formation = data.get("formation")
        slots = data.get("slots", [])

        # Formation valid for game_format
        if game_format and formation:
            if not is_valid_formation(game_format, formation):
                from .formations import FORMATIONS
                raise serializers.ValidationError({
                    "formation": {
                        "detail": f"Formation '{formation}' is not valid for {game_format}-a-side.",
                        "code": "invalid_formation",
                    }
                })

        # Drawing validation
        drawing = data.get("drawing", [])
        validate_drawing(drawing)

        # Count starters
        starters = [s for s in slots if s["role"] == LineupSlot.Role.STARTER]
        if game_format and len(starters) > game_format:
            raise serializers.ValidationError({
                "slots": {
                    "detail": f"Too many starters ({len(starters)}) for {game_format}-a-side.",
                    "code": "too_many_starters",
                }
            })

        # Starter requires x/y
        for s in starters:
            if s.get("x") is None or s.get("y") is None:
                raise serializers.ValidationError({
                    "slots": {
                        "detail": "All starters must have x and y coordinates.",
                        "code": "invalid_drawing",
                    }
                })

        # x/y range 0..1 (DecimalField handles typing, but check bounds)
        for s in slots:
            for coord in ("x", "y"):
                val = s.get(coord)
                if val is not None:
                    if val < 0 or val > 1:
                        raise serializers.ValidationError({
                            "slots": {
                                "detail": f"Slot coordinate {coord} must be between 0 and 1.",
                                "code": "invalid_drawing",
                            }
                        })

        # Duplicate players
        player_ids = [s["player"] for s in slots]
        if len(player_ids) != len(set(player_ids)):
            raise serializers.ValidationError({
                "slots": {
                    "detail": "Duplicate player in lineup.",
                    "code": "duplicate_player",
                }
            })

        # Player membership check — requires match context
        match = self.context.get("match")
        if match:
            from apps.teams.models import PlayerTeamMembership

            active_player_ids = set(
                PlayerTeamMembership.objects.filter(
                    team=match.team,
                    status=PlayerTeamMembership.Status.ACTIVE,
                ).values_list("player_id", flat=True)
            )

            for pid in player_ids:
                if pid not in active_player_ids:
                    raise serializers.ValidationError({
                        "slots": {
                            "detail": f"Player {pid} is not an active member of the match team.",
                            "code": "player_not_in_team",
                        }
                    })

        return data


class TacticBoardReadSerializer(serializers.ModelSerializer):
    academy_name = serializers.CharField(source="academy.name", read_only=True)
    team_name = serializers.CharField(source="team.name", read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        from .models import TacticBoard
        model = TacticBoard
        fields = [
            "id", "academy", "academy_name", "team", "team_name",
            "title", "game_format", "tokens", "drawing",
            "version", "created_by", "created_by_name",
            "created_at", "updated_at",
        ]

    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return None
        name = f"{u.first_name} {u.last_name}".strip()
        return name or u.email


class TacticBoardWriteSerializer(serializers.Serializer):
    academy = serializers.UUIDField(required=False, allow_null=True)
    team = serializers.UUIDField(required=False, allow_null=True)
    title = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    game_format = serializers.IntegerField(required=False)
    tokens = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    drawing = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    version = serializers.IntegerField(required=False, default=0)

    def validate_game_format(self, value):
        from .formations import FORMATIONS
        if value not in FORMATIONS:
            raise serializers.ValidationError(
                f"Invalid game format: {value}. Allowed: {sorted(FORMATIONS.keys())}."
            )
        return value

    def validate(self, data):
        from .validators import validate_drawing, validate_tokens
        from apps.academies.models import Academy
        from apps.teams.models import Team
        from apps.academies.permissions import get_user_academy_ids

        user = self.context["request"].user
        academy_id = data.get("academy")
        team_id = data.get("team")
        is_partial = getattr(self, "partial", False)

        # game_format required on create
        if not is_partial and "game_format" not in data:
            raise serializers.ValidationError({"game_format": "This field is required."})

        # ── Resolve academy ──
        academy = None
        if academy_id:
            try:
                academy = Academy.objects.get(pk=academy_id)
            except Academy.DoesNotExist:
                raise serializers.ValidationError(
                    {"academy": {"detail": "Academy not found.", "code": "academy_not_found"}}
                )
            # Verify user staffs this academy (superuser bypasses)
            if not user.is_superuser:
                user_academy_ids = get_user_academy_ids(user)
                if academy.pk not in user_academy_ids:
                    raise serializers.ValidationError(
                        {"academy": {"detail": "Academy not found.", "code": "academy_not_found"}}
                    )
        elif not is_partial:
            # Create without academy — auto-resolve
            if user.is_superuser:
                raise serializers.ValidationError(
                    {"academy": {"detail": "Academy is required.", "code": "academy_required"}}
                )
            user_academy_ids = get_user_academy_ids(user)
            if len(user_academy_ids) == 0:
                raise serializers.ValidationError(
                    {"academy": {"detail": "You are not a staff member of any academy.", "code": "academy_required"}}
                )
            elif len(user_academy_ids) == 1:
                academy = Academy.objects.get(pk=next(iter(user_academy_ids)))
                data["academy"] = academy.pk
            else:
                raise serializers.ValidationError(
                    {"academy": {"detail": "You staff multiple academies. Please specify one.", "code": "academy_required"}}
                )

        if academy is not None:
            data["_academy"] = academy

        # ── Title default on create ──
        if not is_partial:
            title = data.get("title", "")
            if not title or not title.strip():
                data["title"] = "New board"
            else:
                data["title"] = title.strip()

        # ── Resolve team ──
        team = None
        if team_id:
            try:
                team = Team.objects.get(pk=team_id)
            except Team.DoesNotExist:
                raise serializers.ValidationError({"team": "Team not found."})
            resolve_academy = academy or data.get("_academy")
            if resolve_academy and team.academy_id != resolve_academy.pk:
                raise serializers.ValidationError(
                    {"team": {"detail": "Team does not belong to the selected academy.", "code": "team_not_in_academy"}}
                )
        data["_team"] = team

        # ── Validate drawing ──
        if "drawing" in data:
            validate_drawing(data.get("drawing", []))

        # ── Validate tokens ──
        if "tokens" in data:
            resolve_team = team
            resolve_academy = academy or data.get("_academy")
            try:
                validate_tokens(data.get("tokens", []), team=resolve_team, academy=resolve_academy)
            except serializers.ValidationError as exc:
                code = exc.get_codes() if hasattr(exc, "get_codes") else "invalid_tokens"
                detail_str = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
                raise serializers.ValidationError({
                    "tokens": {"detail": detail_str, "code": code},
                })

        return data
