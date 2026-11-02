import { contactSheetArgs, parseContactSheetFlags } from './contact-sheet'

describe('parseContactSheetFlags', () => {
  it('defaults to one frame every 2 s in 3 columns', () => {
    expect(parseContactSheetFlags({})).toEqual({ every: 2, cols: 3 })
  })

  it('accepts a fractional interval and a column count', () => {
    expect(parseContactSheetFlags({ every: '0.5', cols: '4' })).toEqual({
      every: 0.5,
      cols: 4,
    })
  })

  it.each([
    [{ every: '0' }, '--every'],
    [{ every: 'abc' }, '--every'],
    [{ cols: '0' }, '--cols'],
    [{ cols: '2.5' }, '--cols'],
  ])('rejects %p', (flags, name) => {
    expect(() => parseContactSheetFlags(flags)).toThrow(
      new RegExp(`INVALID_OPTIONS: ${name}`),
    )
  })
})

describe('contactSheetArgs', () => {
  it('samples, scales and tiles into a single PNG frame', () => {
    expect(
      contactSheetArgs('in.mp4', 'out.png', { every: 2, cols: 3 }),
    ).toEqual([
      '-v',
      'error',
      '-y',
      '-i',
      'in.mp4',
      '-vf',
      'fps=1/2,scale=640:-1,tile=3x5',
      '-frames:v',
      '1',
      'out.png',
    ])
  })
})
