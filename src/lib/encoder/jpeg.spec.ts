import { jpegSize } from './jpeg'

/** A minimal JPEG header: SOI, an APP0 segment, then a baseline SOF0 segment. */
function header(width: number, height: number): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]
  const sof0 = [
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0])
}

describe('jpegSize', () => {
  it('reads the size from the start-of-frame segment', () => {
    expect(jpegSize(header(3840, 2160))).toEqual({ width: 3840, height: 2160 })
  })

  it('returns undefined when there is no frame header', () => {
    expect(jpegSize(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeUndefined()
  })
})
