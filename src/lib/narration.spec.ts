import { readingTimeMs, resolveNarrationStyle } from './narration'

const FULL_HD = { width: 1920, height: 1080 }

describe('readingTimeMs', () => {
  it('gives 250 ms per word', () => {
    expect(readingTimeMs('one two three four five six seven eight')).toBe(2000)
  })

  it('clamps short and long captions', () => {
    expect(readingTimeMs('Hi')).toBe(1500)
    expect(readingTimeMs('')).toBe(1500)
    expect(readingTimeMs('word '.repeat(40))).toBe(6000)
  })
})

describe('resolveNarrationStyle', () => {
  it('uses the built-in defaults', () => {
    expect(resolveNarrationStyle(FULL_HD)).toEqual({
      position: 'bottom',
      animation: 'fade',
      fontSizePx: 36,
      maxWidthPct: 64,
      color: '#fff',
      background: 'rgba(17,17,17,.6)',
    })
  })

  it('scales the default font size with the video height', () => {
    expect(resolveNarrationStyle({ width: 1280, height: 720 }).fontSizePx).toBe(
      24,
    )
  })

  it('lets per-call options beat recorder defaults', () => {
    const style = resolveNarrationStyle(
      FULL_HD,
      { position: 'top', color: 'gold' },
      { position: 'bottom-left', color: undefined },
    )
    expect(style).toMatchObject({ position: 'bottom-left', color: 'gold' })
  })
})
