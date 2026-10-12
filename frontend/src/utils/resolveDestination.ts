import type { AuthUser } from '../types'

/**
 * Compute the post-login destination for a given user.
 *
 * Rules (in order):
 * 1. If the user was redirected here from a specific page (from !== '/'),
 *    honour that destination — ProtectedRoute set it intentionally.
 * 2. PLAYER with a linked player profile → their own profile page.
 * 3. PLAYER without a linked profile → /players (will show empty state).
 * 4. PARENT → /players (queryset is already filtered to linked players).
 * 5. COACH / ACADEMY_ADMIN → / (existing dashboard behaviour).
 */
export function resolveDestination(user: AuthUser, from: string): string {
  if (from !== '/') return from

  if (user.role === 'PLAYER') {
    return user.player_profile
      ? `/players/${user.player_profile.player_id}`
      : '/players'
  }

  if (user.role === 'PARENT') {
    return '/players'
  }

  // COACH / ACADEMY_ADMIN
  return '/'
}
