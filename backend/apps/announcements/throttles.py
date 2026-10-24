from rest_framework.throttling import UserRateThrottle


class AnnouncementCreateThrottle(UserRateThrottle):
    """
    Limits announcement creation to 30 per hour per authenticated user.

    Uses the 'announcement_create' scope defined in DEFAULT_THROTTLE_RATES.
    Applied only to the create action, not to reads.
    """

    scope = "announcement_create"
