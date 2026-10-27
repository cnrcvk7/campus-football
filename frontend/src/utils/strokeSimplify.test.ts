import { describe, it, expect } from 'vitest'
import { simplifyStroke } from './strokeSimplify'

describe('simplifyStroke', () => {
  it('returns input unchanged when ≤ 2 points', () => {
    const one: [number, number][] = [[0, 0]]
    expect(simplifyStroke(one)).toEqual(one)
    const two: [number, number][] = [[0, 0], [1, 1]]
    expect(simplifyStroke(two)).toEqual(two)
  })

  it('keeps first and last point', () => {
    const pts: [number, number][] = [[0, 0], [0.001, 0], [0.002, 0], [1, 1]]
    const result = simplifyStroke(pts, 0.5)
    expect(result[0]).toEqual([0, 0])
    expect(result[result.length - 1]).toEqual([1, 1])
  })

  it('removes points closer than minDist', () => {
    // All middle points are very close together
    const pts: [number, number][] = [
      [0, 0], [0.001, 0], [0.002, 0], [0.003, 0], [1, 1],
    ]
    const result = simplifyStroke(pts, 0.01)
    // Only first and last should remain (middle points are < 0.01 apart)
    expect(result.length).toBeLessThan(pts.length)
    expect(result[0]).toEqual([0, 0])
    expect(result[result.length - 1]).toEqual([1, 1])
  })

  it('caps at maxPoints', () => {
    const pts: [number, number][] = Array.from({ length: 1000 }, (_, i) => [i * 0.001, 0])
    const result = simplifyStroke(pts, 0.0001, 50)
    expect(result.length).toBeLessThanOrEqual(50)
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('keeps spaced-out points', () => {
    const pts: [number, number][] = [
      [0, 0], [0.1, 0], [0.2, 0], [0.3, 0], [0.4, 0],
    ]
    const result = simplifyStroke(pts, 0.05)
    expect(result).toEqual(pts)
  })
})
