import { readFileSync } from 'fs'
import { join } from 'path'

import { VERSION } from './version'

describe('VERSION', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
    )
    expect(VERSION).toBe(pkg.version)
  })
})
