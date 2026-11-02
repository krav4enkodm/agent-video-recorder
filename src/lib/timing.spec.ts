import { PACING_PRESETS, resolvePacing } from './timing'

describe('resolvePacing', () => {
  it('returns a preset by name', () => {
    expect(resolvePacing('slow')).toEqual(PACING_PRESETS.slow)
  })

  it('keeps the normal preset at the values the cursor ticket shipped with', () => {
    expect(resolvePacing('normal')).toMatchObject({
      cursorBaseMs: 250,
      cursorMsPerPx: 0.4,
      cursorMinMs: 300,
      cursorMaxMs: 900,
      preClickMs: 150,
      postClickMs: 300,
      typingDelayMs: 60,
      betweenActionsMs: 400,
    })
  })

  it('applies overrides on top of a preset, normal by default', () => {
    expect(resolvePacing({ betweenActionsMs: 0 })).toEqual({
      ...PACING_PRESETS.normal,
      betweenActionsMs: 0,
    })
    expect(resolvePacing({ preset: 'fast', endHoldMs: 3000 })).toEqual({
      ...PACING_PRESETS.fast,
      endHoldMs: 3000,
    })
  })

  it('orders presets fast < normal < slow on every field but settle timeout', () => {
    const { fast, normal, slow } = PACING_PRESETS
    for (const [key, value] of Object.entries(normal)) {
      if (key === 'settleTimeoutMs') continue
      expect(Reflect.get(fast, key)).toBeLessThan(value)
      expect(value).toBeLessThan(Reflect.get(slow, key))
    }
  })

  it('rejects unknown presets and negative overrides', () => {
    // @ts-expect-error JavaScript callers can pass any string.
    expect(() => resolvePacing('natural')).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
    expect(() => resolvePacing({ preClickMs: -1 })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    )
  })
})
