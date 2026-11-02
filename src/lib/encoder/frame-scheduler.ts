export interface TimedFrame {
  data: Buffer
  timestampMs: number
}

/**
 * Turns Chromium's change-driven screencast frames into a constant-frame-rate
 * sequence: each output slot shows the latest frame received before it, so
 * idle periods repeat the previous frame and bursts keep only the newest one.
 */
export class FrameScheduler {
  private firstTimestampMs: number | undefined
  private pending: { data: Buffer; slot: number } | undefined
  private written = 0

  constructor(
    private readonly fps: number,
    private readonly emit: (data: Buffer) => void,
  ) {}

  get framesWritten(): number {
    return this.written
  }

  push(frame: TimedFrame): void {
    this.firstTimestampMs ??= frame.timestampMs
    const slot = this.slotOf(frame.timestampMs)
    if (this.pending && slot < this.pending.slot) return
    if (this.pending && slot > this.pending.slot) {
      this.emitRepeated(this.pending.data, slot - this.pending.slot)
    }
    this.pending = { data: frame.data, slot }
  }

  /** Writes the remaining frames up to `stopTimeMs`; at least one slot for the last frame. */
  finish(stopTimeMs: number): void {
    if (!this.pending) return
    const endSlot = Math.max(
      this.pending.slot + 1,
      Math.ceil(this.slotPosition(stopTimeMs)),
    )
    this.emitRepeated(this.pending.data, endSlot - this.pending.slot)
    this.pending = undefined
  }

  private slotOf(timestampMs: number): number {
    return Math.floor(this.slotPosition(timestampMs))
  }

  private slotPosition(timestampMs: number): number {
    return (
      ((timestampMs - (this.firstTimestampMs ?? timestampMs)) * this.fps) / 1000
    )
  }

  private emitRepeated(data: Buffer, count: number): void {
    for (let i = 0; i < count; i++) this.emit(data)
    this.written += count
  }
}
