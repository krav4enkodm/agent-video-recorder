import { buildFfmpegArgs, checkFfmpeg } from './ffmpeg'

describe('buildFfmpegArgs', () => {
  it('reads MJPEG from stdin at the target rate and writes H.264 MP4', () => {
    const args = buildFfmpegArgs(60, '/tmp/out.mp4')
    const after = (flag: string) => args[args.indexOf(flag) + 1]
    expect(after('-framerate')).toBe('60')
    expect(after('-i')).toBe('pipe:0')
    expect(args).toEqual(
      expect.arrayContaining([
        '-c:v',
        'libx264',
        '-color_range',
        'tv',
        '-movflags',
        '+faststart',
      ]),
    )
    expect(args.at(-1)).toBe('/tmp/out.mp4')
  })
})

describe('checkFfmpeg', () => {
  it('reports a missing binary', async () => {
    await expect(checkFfmpeg('/nonexistent/ffmpeg')).rejects.toMatchObject({
      code: 'FFMPEG_NOT_FOUND',
    })
  })

  it('reports a binary without libx264', async () => {
    // `echo` prints its arguments, so the "encoder list" lacks libx264.
    await expect(checkFfmpeg('echo')).rejects.toMatchObject({
      code: 'FFMPEG_NO_H264',
    })
  })
})
