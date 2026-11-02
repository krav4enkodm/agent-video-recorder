import type { RecorderOptions } from './options'
import type { Recorder } from './recorder'
import type { Page } from 'playwright-core'

export interface Scenario {
  /** Used in the default output file name. Defaults to the scenario file name. */
  name?: string
  /** Base URL for relative `page.goto()` / `recorder.goto()` paths. */
  baseURL?: string
  recorder?: RecorderOptions
  /** Runs before recording starts: sign in, seed data, open the first page. */
  setup?: (ctx: { page: Page }) => Promise<void>
  /** The recorded part. */
  run: (ctx: { page: Page; recorder: Recorder }) => Promise<void>
}

/** Identity helper that gives scenario files type checking and editor hints. */
export function defineScenario(scenario: Scenario): Scenario {
  return scenario
}

export function isScenario(value: unknown): value is Scenario {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'run') === 'function'
  )
}
