"""
Drawing JSON validation (design section 4.3).

Each drawing element is a dict with a required "type" key.
Coordinates are normalized 0..1.  The full list is validated for
size limits and unknown keys.
"""

import json
import uuid

from rest_framework.exceptions import ValidationError

# --- Constants ---------------------------------------------------------------

ALLOWED_TYPES = {"arrow", "line", "freehand", "ellipse", "rect", "text"}
ALLOWED_COLORS = {"white", "yellow", "red", "blue", "black"}
ALLOWED_WIDTHS = {"sm", "md", "lg"}

MAX_ELEMENTS = 300
MAX_SERIALIZED_BYTES = 100_000  # ~100 KB
MAX_FREEHAND_POINTS = 500
MAX_TEXT_LENGTH = 120

# Per-type schema: which keys are allowed (beyond shared keys).
_SHARED_KEYS = {"id", "type", "color", "width", "dashed"}
_TYPE_KEYS = {
    "arrow": _SHARED_KEYS | {"points"},
    "line": _SHARED_KEYS | {"points"},
    "freehand": _SHARED_KEYS | {"points"},
    "ellipse": _SHARED_KEYS | {"center", "rx", "ry"},
    "rect": _SHARED_KEYS | {"origin", "w", "h"},
    "text": {"id", "type", "color", "at", "text"},
}


# --- Helpers -----------------------------------------------------------------

def _check_coord(value, label: str) -> None:
    """Raise if value is not a number in [0, 1]."""
    if not isinstance(value, (int, float)):
        raise ValidationError(
            detail=f"Drawing coordinate {label} must be a number.",
            code="invalid_drawing",
        )
    if value < 0 or value > 1:
        raise ValidationError(
            detail=f"Drawing coordinate {label} must be between 0 and 1.",
            code="invalid_drawing",
        )


def _check_point(point, label: str) -> None:
    """Validate a [x, y] pair."""
    if not isinstance(point, list) or len(point) != 2:
        raise ValidationError(
            detail=f"Drawing point {label} must be a [x, y] pair.",
            code="invalid_drawing",
        )
    _check_coord(point[0], f"{label}[0]")
    _check_coord(point[1], f"{label}[1]")


def _check_positive_number(value, label: str) -> None:
    if not isinstance(value, (int, float)) or value < 0 or value > 1:
        raise ValidationError(
            detail=f"Drawing {label} must be a number between 0 and 1.",
            code="invalid_drawing",
        )


# --- Element validators ------------------------------------------------------

def _validate_element(elem: dict) -> None:
    """Validate a single drawing element."""
    if not isinstance(elem, dict):
        raise ValidationError(
            detail="Each drawing element must be an object.",
            code="invalid_drawing",
        )

    elem_type = elem.get("type")
    if elem_type not in ALLOWED_TYPES:
        raise ValidationError(
            detail=f"Invalid drawing element type: {elem_type}.",
            code="invalid_drawing",
        )

    # Unknown keys
    allowed = _TYPE_KEYS[elem_type]
    unknown = set(elem.keys()) - allowed
    if unknown:
        raise ValidationError(
            detail=f"Unknown keys in drawing element: {', '.join(sorted(unknown))}.",
            code="invalid_drawing",
        )

    # id — optional but if present must be a string
    if "id" in elem and not isinstance(elem["id"], str):
        raise ValidationError(
            detail="Drawing element id must be a string.",
            code="invalid_drawing",
        )

    # color
    color = elem.get("color")
    if color is not None:
        if color not in ALLOWED_COLORS:
            raise ValidationError(
                detail=f"Invalid drawing color: {color}. Allowed: {', '.join(sorted(ALLOWED_COLORS))}.",
                code="invalid_drawing",
            )

    # width (not applicable to text)
    if elem_type != "text":
        width = elem.get("width")
        if width is not None and width not in ALLOWED_WIDTHS:
            raise ValidationError(
                detail=f"Invalid drawing width: {width}. Allowed: {', '.join(sorted(ALLOWED_WIDTHS))}.",
                code="invalid_drawing",
            )

        # dashed
        dashed = elem.get("dashed")
        if dashed is not None and not isinstance(dashed, bool):
            raise ValidationError(
                detail="Drawing dashed must be a boolean.",
                code="invalid_drawing",
            )

    # Type-specific validation
    if elem_type in ("arrow", "line"):
        points = elem.get("points")
        if not isinstance(points, list) or len(points) < 2:
            raise ValidationError(
                detail=f"Drawing {elem_type} requires at least 2 points.",
                code="invalid_drawing",
            )
        for i, pt in enumerate(points):
            _check_point(pt, f"{elem_type}.points[{i}]")

    elif elem_type == "freehand":
        points = elem.get("points")
        if not isinstance(points, list) or len(points) < 2:
            raise ValidationError(
                detail="Drawing freehand requires at least 2 points.",
                code="invalid_drawing",
            )
        if len(points) > MAX_FREEHAND_POINTS:
            raise ValidationError(
                detail=f"Freehand drawing exceeds {MAX_FREEHAND_POINTS} points.",
                code="invalid_drawing",
            )
        for i, pt in enumerate(points):
            _check_point(pt, f"freehand.points[{i}]")

    elif elem_type == "ellipse":
        if "center" in elem:
            _check_point(elem["center"], "ellipse.center")
        if "rx" in elem:
            _check_positive_number(elem["rx"], "ellipse.rx")
        if "ry" in elem:
            _check_positive_number(elem["ry"], "ellipse.ry")

    elif elem_type == "rect":
        if "origin" in elem:
            _check_point(elem["origin"], "rect.origin")
        if "w" in elem:
            _check_positive_number(elem["w"], "rect.w")
        if "h" in elem:
            _check_positive_number(elem["h"], "rect.h")

    elif elem_type == "text":
        at = elem.get("at")
        if at is not None:
            _check_point(at, "text.at")
        text = elem.get("text")
        if text is not None:
            if not isinstance(text, str):
                raise ValidationError(
                    detail="Drawing text must be a string.",
                    code="invalid_drawing",
                )
            if len(text) > MAX_TEXT_LENGTH:
                raise ValidationError(
                    detail=f"Drawing text exceeds {MAX_TEXT_LENGTH} characters.",
                    code="invalid_drawing",
                )


# --- Top-level validator -----------------------------------------------------

def validate_drawing(drawing) -> list:
    """
    Validate the full drawing list. Returns the validated list.
    Raises rest_framework.exceptions.ValidationError with code='invalid_drawing'.
    """
    if not isinstance(drawing, list):
        raise ValidationError(
            detail="Drawing must be a list.",
            code="invalid_drawing",
        )

    if len(drawing) > MAX_ELEMENTS:
        raise ValidationError(
            detail=f"Drawing exceeds {MAX_ELEMENTS} elements.",
            code="invalid_drawing",
        )

    # Size check
    serialized = json.dumps(drawing, separators=(",", ":"))
    if len(serialized.encode("utf-8")) > MAX_SERIALIZED_BYTES:
        raise ValidationError(
            detail="Drawing payload exceeds 100 KB.",
            code="invalid_drawing",
        )

    for elem in drawing:
        _validate_element(elem)

    return drawing


# --- Token validation (TacticBoard) -----------------------------------------

ALLOWED_TOKEN_KINDS = {"home", "away", "ball"}
_TOKEN_KEYS = {"id", "kind", "x", "y", "label", "player_id"}
MAX_TOKENS = 40
MAX_TOKEN_LABEL_LENGTH = 3


def _validate_token(token: dict, index: int) -> None:
    if not isinstance(token, dict):
        raise ValidationError(
            detail=f"Token {index} must be an object.",
            code="invalid_tokens",
        )

    # Unknown keys
    unknown = set(token.keys()) - _TOKEN_KEYS
    if unknown:
        raise ValidationError(
            detail=f"Unknown keys in token {index}: {', '.join(sorted(unknown))}.",
            code="invalid_tokens",
        )

    # id
    tid = token.get("id")
    if tid is not None and not isinstance(tid, str):
        raise ValidationError(detail=f"Token {index} id must be a string.", code="invalid_tokens")

    # kind
    kind = token.get("kind")
    if kind not in ALLOWED_TOKEN_KINDS:
        raise ValidationError(
            detail=f"Token {index} has invalid kind: {kind}. Allowed: {sorted(ALLOWED_TOKEN_KINDS)}.",
            code="invalid_tokens",
        )

    # x, y
    for coord_name in ("x", "y"):
        val = token.get(coord_name)
        if val is None:
            raise ValidationError(
                detail=f"Token {index} requires {coord_name}.",
                code="invalid_tokens",
            )
        _check_coord(val, f"token[{index}].{coord_name}")

    # label
    label = token.get("label")
    if label is not None:
        if not isinstance(label, str):
            raise ValidationError(detail=f"Token {index} label must be a string.", code="invalid_tokens")
        if len(label) > MAX_TOKEN_LABEL_LENGTH:
            raise ValidationError(
                detail=f"Token {index} label exceeds {MAX_TOKEN_LABEL_LENGTH} characters.",
                code="invalid_tokens",
            )

    # player_id
    player_id = token.get("player_id")
    if player_id is not None:
        if not isinstance(player_id, str):
            raise ValidationError(detail=f"Token {index} player_id must be a string.", code="invalid_tokens")
        if kind != "home":
            raise ValidationError(
                detail=f"Token {index}: player_id is only allowed for 'home' tokens.",
                code="invalid_tokens",
            )


def validate_tokens(tokens, *, team=None, academy=None) -> list:
    """
    Validate the full token list for a TacticBoard.
    If team is provided, player_id values are checked against ACTIVE members.
    """
    if not isinstance(tokens, list):
        raise ValidationError(detail="Tokens must be a list.", code="invalid_tokens")

    if len(tokens) > MAX_TOKENS:
        raise ValidationError(
            detail=f"Tokens list exceeds {MAX_TOKENS} items.",
            code="invalid_tokens",
        )

    ball_count = 0
    player_ids_seen = []

    for i, token in enumerate(tokens):
        _validate_token(token, i)

        if token.get("kind") == "ball":
            ball_count += 1
            if ball_count > 1:
                raise ValidationError(
                    detail="At most one ball token is allowed.",
                    code="invalid_tokens",
                )

        pid = token.get("player_id")
        if pid is not None:
            if team is None:
                raise ValidationError(
                    detail=f"Token {i} has player_id but the board has no team.",
                    code="invalid_tokens",
                )
            player_ids_seen.append(pid)

    # Validate player IDs against team roster
    if player_ids_seen and team is not None:
        from apps.teams.models import PlayerTeamMembership
        import uuid as _uuid

        try:
            parsed_ids = [_uuid.UUID(pid) for pid in player_ids_seen]
        except (ValueError, AttributeError):
            raise ValidationError(
                detail="Token player_id must be a valid UUID.",
                code="invalid_tokens",
            )

        active_ids = set(
            PlayerTeamMembership.objects.filter(
                team=team,
                status=PlayerTeamMembership.Status.ACTIVE,
            ).values_list("player_id", flat=True)
        )

        for pid in parsed_ids:
            if pid not in active_ids:
                raise ValidationError(
                    detail=f"Player {pid} is not an active member of the board's team.",
                    code="invalid_tokens",
                )

    return tokens
