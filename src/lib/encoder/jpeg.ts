import type { Size } from '../options'

/** Reads the pixel size from a JPEG's start-of-frame header, or undefined if none is found. */
export function jpegSize(data: Buffer): Size | undefined {
  let offset = 2
  while (offset + 9 <= data.length && data[offset] === 0xff) {
    const marker = data[offset + 1] ?? 0
    // SOF0–SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) do not.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      }
    }
    offset += 2 + data.readUInt16BE(offset + 2)
  }
  return undefined
}
