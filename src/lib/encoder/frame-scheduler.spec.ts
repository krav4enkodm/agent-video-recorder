import { FrameScheduler } from './frame-scheduler'

function frame(label: string, timestampMs: number) {
  return { data: Buffer.from(label), timestampMs }
}

function collect(fps: number) {
  const out: string[] = []
  const scheduler = new FrameScheduler(fps, (data) => out.push(data.toString()))
  return { out, scheduler }
}

describe('FrameScheduler', () => {
  it('repeats the previous frame across idle slots', () => {
    const { out, scheduler } = collect(10)
    scheduler.push(frame('a', 1000))
    scheduler.push(frame('b', 1300))
    expect(out).toEqual(['a', 'a', 'a'])
  })

  it('keeps only the latest frame within one slot', () => {
    const { out, scheduler } = collect(10)
    scheduler.push(frame('a', 1000))
    scheduler.push(frame('b', 1050))
    scheduler.push(frame('c', 1100))
    expect(out).toEqual(['b'])
  })

  it('ignores frames older than the pending slot', () => {
    const { out, scheduler } = collect(10)
    scheduler.push(frame('a', 1000))
    scheduler.push(frame('b', 1200))
    scheduler.push(frame('old', 1100))
    scheduler.finish(1300)
    expect(out).toEqual(['a', 'a', 'b'])
  })

  it('fills up to the stop time on finish', () => {
    const { out, scheduler } = collect(10)
    scheduler.push(frame('a', 1000))
    scheduler.push(frame('b', 1100))
    scheduler.finish(1450)
    expect(out).toEqual(['a', 'b', 'b', 'b', 'b'])
    expect(scheduler.framesWritten).toBe(5)
  })

  it('writes at least one slot for the last frame', () => {
    const { out, scheduler } = collect(10)
    scheduler.push(frame('a', 1000))
    scheduler.finish(1000)
    expect(out).toEqual(['a'])
  })

  it('writes nothing when no frame arrived', () => {
    const { out, scheduler } = collect(10)
    scheduler.finish(5000)
    expect(out).toEqual([])
  })

  it.each([
    [30, 30],
    [60, 60],
  ])('produces %i frames per second at %i fps', (fps, expected) => {
    const { scheduler } = collect(fps)
    scheduler.push(frame('a', 0))
    scheduler.finish(1000)
    expect(scheduler.framesWritten).toBe(expected)
  })
})
