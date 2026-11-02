import type { Timing } from '../timing'

export interface Point {
  x: number
  y: number
}

// How far the curve bows away from the straight line, as a share of the distance.
const CURVE_BOW = 0.12

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/** Control point offset to the left of the travel direction (screen coordinates, y down). */
export function controlPoint(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  // (dy, -dx) is the left normal scaled by the distance, so this bows by CURVE_BOW × distance.
  return {
    x: (from.x + to.x) / 2 + dy * CURVE_BOW,
    y: (from.y + to.y) / 2 - dx * CURVE_BOW,
  }
}

/** Points along a quadratic Bézier from → to, eased so motion starts and ends slowly. */
export function cursorPath(from: Point, to: Point, samples = 30): Point[] {
  const c = controlPoint(from, to)
  const points: Point[] = []
  for (let i = 0; i <= samples; i++) {
    const t = easeInOutCubic(i / samples)
    const u = 1 - t
    points.push({
      x: u * u * from.x + 2 * u * t * c.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * c.y + t * t * to.y,
    })
  }
  points[samples] = { ...to }
  return points
}

export function cursorDuration(
  distancePx: number,
  timing: Pick<
    Timing,
    'cursorBaseMs' | 'cursorMsPerPx' | 'cursorMinMs' | 'cursorMaxMs'
  >,
): number {
  const raw = timing.cursorBaseMs + distancePx * timing.cursorMsPerPx
  return Math.min(timing.cursorMaxMs, Math.max(timing.cursorMinMs, raw))
}
