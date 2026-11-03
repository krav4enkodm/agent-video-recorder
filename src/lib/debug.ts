import { format } from 'util'

/**
 * Logs why an effect or wait was skipped. Silent unless `AVR_DEBUG=1`, and
 * always on stderr: `avr record` keeps stdout for its result JSON.
 */
export function debug(...args: unknown[]): void {
  if (process.env['AVR_DEBUG'] !== '1') return
  process.stderr.write(`[agent-video-recorder] ${format(...args)}\n`)
}
