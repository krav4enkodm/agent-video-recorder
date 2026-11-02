export type RecorderErrorCode =
  | 'INVALID_OPTIONS'
  | 'FFMPEG_NOT_FOUND'
  | 'FFMPEG_NO_H264'
  | 'FFMPEG_FAILED'
  | 'UNSUPPORTED_BROWSER'
  | 'ALREADY_STARTED'
  | 'NOT_STARTED'
  | 'NO_FRAMES'

export class RecorderError extends Error {
  constructor(
    readonly code: RecorderErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`)
    this.name = 'RecorderError'
  }
}
