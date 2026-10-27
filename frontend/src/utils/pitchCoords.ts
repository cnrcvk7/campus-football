/**
 * Centralized coordinate conversion for the horizontal tactics pitch.
 *
 * CANONICAL coordinates (matches backend & formation templates, NEVER changes):
 *   cx: 0..1 across the pitch (left→right as seen from behind own goal)
 *   cy: 0..1 along the pitch  (0 = own goal line, 1 = opponent goal line)
 *
 * DISPLAY coordinates (horizontal pitch, own goal on LEFT, attacking RIGHT):
 *   dx: 0..1 along the pitch  (left→right on screen; 0 = own goal)
 *   dy: 0..1 across the pitch (top→bottom on screen; 0 = left touchline)
 *
 * Mapping:   dx = cy,  dy = cx   (a coordinate swap)
 * Reverse:   cx = dy,  cy = dx
 *
 * The SVG viewBox is "0 0 1.4 1" (horizontal).
 * The field boundary occupies (FIELD_LEFT, FIELD_TOP) to (FIELD_LEFT+FIELD_W, FIELD_TOP+FIELD_H).
 * The token g-transform is: translate(FIELD_LEFT, FIELD_TOP) scale(FIELD_W, FIELD_H).
 */

// ---------------------------------------------------------------------------
// SVG layout constants
// ---------------------------------------------------------------------------

export const FIELD_LEFT = 0.2
export const FIELD_TOP = 0.02
export const FIELD_W = 1.0
export const FIELD_H = 0.96

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

/** Clamp a coordinate to [0, 1]. */
export function clampCoord(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// ---------------------------------------------------------------------------
// Canonical ↔ display
// ---------------------------------------------------------------------------

/** Canonical → display (swap axes). */
export function canonicalToDisplay(cx: number, cy: number): { dx: number; dy: number } {
  return { dx: cy, dy: cx }
}

/** Display → canonical (swap axes back). */
export function displayToCanonical(dx: number, dy: number): { cx: number; cy: number } {
  return { cx: dy, cy: dx }
}

// ---------------------------------------------------------------------------
// SVG viewBox → display (undo the g-transform)
// ---------------------------------------------------------------------------

export function svgToDisplay(svgX: number, svgY: number): { dx: number; dy: number } {
  return {
    dx: (svgX - FIELD_LEFT) / FIELD_W,
    dy: (svgY - FIELD_TOP) / FIELD_H,
  }
}

// ---------------------------------------------------------------------------
// Screen pixels → canonical  (the single entry-point for all drag code)
// ---------------------------------------------------------------------------

/**
 * Convert screen coordinates to canonical pitch coordinates.
 * Reads getScreenCTM() fresh on every call (never cached).
 * Returns null only when the SVG has no CTM.
 */
export function screenToCanonical(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
): { cx: number; cy: number } | null {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const svgPt = pt.matrixTransform(ctm.inverse())
  const { dx, dy } = svgToDisplay(svgPt.x, svgPt.y)
  return displayToCanonical(dx, dy)
}
