import {
  defaultOutputPath,
  resolveHighlight,
  resolveOptions,
  resolveSize,
} from './options'
import { PACING_PRESETS } from './timing'

describe('resolveSize', () => {
  it.each([
    ['720p', { width: 1280, height: 720 }],
    ['1080p', { width: 1920, height: 1080 }],
    ['1440p', { width: 2560, height: 1440 }],
  ] as const)('maps %s', (preset, size) => {
    expect(resolveSize(preset)).toEqual(size)
  })

  it('accepts a custom even size', () => {
    expect(resolveSize({ width: 1440, height: 900 })).toEqual({
      width: 1440,
      height: 900,
    })
  })

  it.each([
    { width: 1441, height: 900 },
    { width: 0, height: 900 },
    { width: 1440.5, height: 900 },
  ])('rejects %o', (size) => {
    expect(() => resolveSize(size)).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
  })
})

describe('resolveOptions', () => {
  it('applies defaults', () => {
    expect(resolveOptions({}, {})).toEqual({
      size: { width: 1920, height: 1080 },
      videoSize: { width: 1920, height: 1080 },
      fps: 60,
      output: undefined,
      quality: 90,
      ffmpegPath: 'ffmpeg',
      overlay: {
        cursor: { size: 24, color: '#111', outline: '#fff' },
        clickEffect: {
          color: 'rgb(37,99,235)',
          durationMs: 500,
          sizePx: 56,
          intensity: 0.9,
        },
        highlight: {
          kind: 'glow',
          color: 'rgba(59,130,246,.55)',
          widthPx: 8,
          opacity: 0.9,
        },
      },
      timing: PACING_PRESETS.normal,
      narration: {},
    })
  })

  it('keeps the layout size and doubles the video size at scale 2', () => {
    const resolved = resolveOptions({ resolution: '1080p', scale: 2 }, {})
    expect(resolved.size).toEqual({ width: 1920, height: 1080 })
    expect(resolved.videoSize).toEqual({ width: 3840, height: 2160 })
  })

  it('rejects an unsupported scale', () => {
    // @ts-expect-error -- 3 is outside Scale; checks the runtime guard for JS callers
    expect(() => resolveOptions({ scale: 3 }, {})).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
  })

  it('takes ffmpeg from AVR_FFMPEG_PATH unless the option is set', () => {
    expect(
      resolveOptions({}, { AVR_FFMPEG_PATH: '/opt/ffmpeg' }).ffmpegPath,
    ).toBe('/opt/ffmpeg')
    expect(
      resolveOptions({ ffmpegPath: '/x' }, { AVR_FFMPEG_PATH: '/opt/ffmpeg' })
        .ffmpegPath,
    ).toBe('/x')
  })

  it('rejects unsupported fps and quality', () => {
    // @ts-expect-error JavaScript callers can pass any number.
    expect(() => resolveOptions({ fps: 25 }, {})).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
    expect(() => resolveOptions({ quality: 0 }, {})).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
  })
})

describe('overlay options', () => {
  it('merges partial styles over the defaults', () => {
    const { overlay } = resolveOptions(
      { cursor: { size: 32 }, clickEffect: { color: 'red' } },
      {},
    )
    expect(overlay.cursor).toEqual({ size: 32, color: '#111', outline: '#fff' })
    expect(overlay.clickEffect).toMatchObject({ color: 'red', durationMs: 500 })
  })

  it('disables effects with false', () => {
    expect(
      resolveOptions(
        { cursor: false, clickEffect: false, highlights: false },
        {},
      ).overlay,
    ).toEqual({ cursor: false, clickEffect: false, highlight: false })
  })
})

describe('resolveHighlight', () => {
  it('maps presets', () => {
    expect(resolveHighlight('strong')).toEqual({
      kind: 'outline',
      color: '#3b82f6',
      widthPx: 3,
      opacity: 1,
    })
  })

  it('fills a custom style from the defaults of its kind', () => {
    expect(resolveHighlight({ kind: 'background', color: 'gold' })).toEqual({
      kind: 'background',
      color: 'gold',
      widthPx: 0,
      opacity: 1,
    })
  })

  it('rejects unknown kinds', () => {
    // @ts-expect-error JavaScript callers can pass any string.
    expect(() => resolveHighlight({ kind: 'sparkle' })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
  })
})

describe('defaultOutputPath', () => {
  it('stamps the local time under ./recordings', () => {
    expect(defaultOutputPath(new Date(2026, 9, 31, 9, 5, 7), '/work')).toBe(
      '/work/recordings/recording-20261031-090507.mp4',
    )
  })
})
