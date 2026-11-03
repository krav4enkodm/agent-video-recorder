import { debug } from './debug'

describe('debug', () => {
  const saved = process.env['AVR_DEBUG']
  let stdout: jest.SpyInstance
  let stderr: jest.SpyInstance

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdout.mockRestore()
    stderr.mockRestore()
    if (saved === undefined) delete process.env['AVR_DEBUG']
    else process.env['AVR_DEBUG'] = saved
  })

  it('is silent by default', () => {
    delete process.env['AVR_DEBUG']
    debug('overlay effect skipped:', new Error('gone'))
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
  })

  it('writes to stderr, never stdout, with AVR_DEBUG=1', () => {
    process.env['AVR_DEBUG'] = '1'
    debug('UI still animating after %d ms', 2000)
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).toHaveBeenCalledWith(
      '[agent-video-recorder] UI still animating after 2000 ms\n',
    )
  })
})
