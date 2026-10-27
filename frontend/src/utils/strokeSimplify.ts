/**
 * Simplify a polyline by skipping points that are closer than `minDist`
 * to the last kept point (Radial Distance simplification).
 *
 * Always keeps the first and last point.
 * Result length is capped at `maxPoints`.
 */
export function simplifyStroke(
  points: [number, number][],
  minDist = 0.005,
  maxPoints = 500,
): [number, number][] {
  if (points.length <= 2) return points

  const result: [number, number][] = [points[0]]
  let [lx, ly] = points[0]

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    const d = Math.hypot(px - lx, py - ly)
    if (d >= minDist) {
      result.push(points[i])
      lx = px
      ly = py
    }
    if (result.length >= maxPoints - 1) break
  }

  result.push(points[points.length - 1])
  return result
}
