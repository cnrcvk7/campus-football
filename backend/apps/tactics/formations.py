"""
Valid formations per game format.

The frontend mirrors this list in frontend/src/constants/formations.ts.
Keys are game_format integers, values are lists of formation strings.
"""

FORMATIONS = {
    11: [
        "4-4-2",
        "4-3-3",
        "4-2-3-1",
        "3-5-2",
        "5-3-2",
    ],
    9: [
        "3-3-2",
        "3-2-3",
        "2-3-3",
    ],
    7: [
        "2-3-1",
        "3-2-1",
        "2-1-2-1",
    ],
    5: [
        "2-2",
        "1-2-1",
        "2-1-1",
    ],
}

GAME_FORMATS = sorted(FORMATIONS.keys(), reverse=True)


def is_valid_formation(game_format: int, formation: str) -> bool:
    """Return True if formation is valid for the given game_format."""
    return formation in FORMATIONS.get(game_format, [])
