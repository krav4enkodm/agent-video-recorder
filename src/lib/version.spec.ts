import { readFileSync } from 'fs'
import { join } from 'path'

import { VERSION } from './version'

const ROOT = join(__dirname, '../..')

function readJson(file: string) {
  return JSON.parse(readFileSync(join(ROOT, file), 'utf-8'))
}

describe('VERSION', () => {
  it('matches package.json', () => {
    expect(VERSION).toBe(readJson('package.json').version)
  })

  it('matches the Claude Code plugin manifest', () => {
    expect(readJson('.claude-plugin/plugin.json').version).toBe(
      readJson('package.json').version,
    )
  })
})
