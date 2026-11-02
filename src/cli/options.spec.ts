import { planRecording, scenarioName } from './options'

const NOW = new Date(2026, 9, 31, 14, 3, 9)
const run = async () => undefined

describe('planRecording', () => {
  it('names the default output after the scenario file', () => {
    const plan = planRecording(
      { run },
      'flows/checkout.scenario.ts',
      {},
      NOW,
      '/work',
    )
    expect(plan.recorder.output).toBe(
      '/work/recordings/checkout-20261031-140309.mp4',
    )
  })

  it('lets CLI flags override the scenario options', () => {
    const plan = planRecording(
      {
        run,
        baseURL: 'http://scenario',
        recorder: {
          resolution: '1080p',
          fps: 60,
          pacing: 'slow',
          output: 'a.mp4',
        },
      },
      'x.ts',
      {
        resolution: '720p',
        fps: '30',
        pacing: 'fast',
        out: 'b.mp4',
        baseUrl: 'http://flag',
      },
      NOW,
      '/work',
    )
    expect(plan).toEqual({
      recorder: {
        resolution: '720p',
        fps: 30,
        pacing: 'fast',
        output: '/work/b.mp4',
      },
      baseURL: 'http://flag',
    })
  })

  it('keeps scenario options when no flag is given', () => {
    const plan = planRecording(
      {
        run,
        baseURL: 'http://scenario',
        recorder: { fps: 30, output: 'out/a.mp4' },
      },
      'x.ts',
      {},
      NOW,
      '/work',
    )
    expect(plan).toEqual({
      recorder: { fps: 30, output: '/work/out/a.mp4' },
      baseURL: 'http://scenario',
    })
  })

  it('accepts the 1440p preset', () => {
    const plan = planRecording(
      { run },
      'x.ts',
      { resolution: '1440p' },
      NOW,
      '/work',
    )
    expect(plan.recorder.resolution).toBe('1440p')
  })

  it('passes --scale through as a number', () => {
    const plan = planRecording({ run }, 'x.ts', { scale: '2' }, NOW, '/work')
    expect(plan.recorder.scale).toBe(2)
  })

  it.each([
    [{ fps: '25' }, '--fps'],
    [{ resolution: '4k' }, '--resolution'],
    [{ scale: '1.5' }, '--scale'],
    [{ pacing: 'natural' }, '--pacing'],
  ])('rejects %o', (flags, flag) => {
    expect(() => planRecording({ run }, 'x.ts', flags, NOW, '/work')).toThrow(
      expect.objectContaining({
        code: 'INVALID_OPTIONS',
        message: expect.stringContaining(flag),
      }),
    )
  })
})

describe('scenarioName', () => {
  it('prefers the scenario name and slugs it', () => {
    expect(scenarioName({ run, name: 'Book a Demo!' }, 'x.ts')).toBe(
      'book-a-demo',
    )
  })

  it.each([
    ['a/b/Sign Up.scenario.ts', 'sign-up'],
    ['a/b/flow.mts', 'flow'],
    ['a/b/.ts', 'recording'],
  ])('derives %s → %s', (file, name) => {
    expect(scenarioName({ run }, file)).toBe(name)
  })
})
