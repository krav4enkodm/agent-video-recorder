import { NORMAL_TIMING } from '../timing'
import {
  controlPoint,
  cursorDuration,
  cursorPath,
  easeInOutCubic,
} from './path'

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1 and never moves backwards', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    let previous = 0
    for (let i = 1; i <= 100; i++) {
      const value = easeInOutCubic(i / 100)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('moves slowly at both ends', () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1)
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9)
  })
})

describe('cursorPath', () => {
  it('starts and ends exactly at the endpoints', () => {
    const from = { x: 10.5, y: 20.25 }
    const to = { x: 803.7, y: 411.1 }
    const points = cursorPath(from, to)
    expect(points).toHaveLength(31)
    expect(points[0]).toEqual(from)
    expect(points[30]).toEqual(to)
  })

  it('bows to the left of the travel direction, the same way every time', () => {
    // Moving right on screen (y grows downwards), "left" is up.
    expect(controlPoint({ x: 0, y: 100 }, { x: 200, y: 100 })).toEqual({
      x: 100,
      y: 100 - 200 * 0.12,
    })
    // Moving left, "left" is down.
    expect(controlPoint({ x: 200, y: 100 }, { x: 0, y: 100 })).toEqual({
      x: 100,
      y: 100 + 200 * 0.12,
    })
    expect(cursorPath({ x: 0, y: 0 }, { x: 300, y: 50 })).toEqual(
      cursorPath({ x: 0, y: 0 }, { x: 300, y: 50 }),
    )
  })
})

describe('cursorDuration', () => {
  it('grows with distance between the clamps', () => {
    expect(cursorDuration(500, NORMAL_TIMING)).toBe(250 + 500 * 0.4)
  })

  it('clamps short and long moves', () => {
    expect(cursorDuration(0, NORMAL_TIMING)).toBe(NORMAL_TIMING.cursorMinMs)
    expect(cursorDuration(5000, NORMAL_TIMING)).toBe(NORMAL_TIMING.cursorMaxMs)
  })
})
