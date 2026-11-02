import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const SCRIPT = join(__dirname, 'check-release-version.mjs')
const REPO_ROOT = join(__dirname, '..')

let root: string

function writeVersions(versions: {
  pkg?: string
  plugin?: string
  ts?: string
}) {
  const { pkg = '1.2.3', plugin = '1.2.3', ts = '1.2.3' } = versions
  mkdirSync(join(root, '.claude-plugin'), { recursive: true })
  mkdirSync(join(root, 'src/lib'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'x', version: pkg }),
  )
  writeFileSync(
    join(root, '.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'x', version: plugin }),
  )
  writeFileSync(
    join(root, 'src/lib/version.ts'),
    `export const VERSION = '${ts}'\n`,
  )
}

function check(...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--root', root, ...args],
    { encoding: 'utf-8' },
  )
  return { status: result.status, output: result.stdout + result.stderr }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'avr-release-version-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('check-release-version', () => {
  it('passes when the tag and all three versions match', () => {
    writeVersions({})
    const { status, output } = check('v1.2.3')
    expect(output).toContain('1.2.3')
    expect(status).toBe(0)
  })

  it('fails when the tag does not equal v + package.json version', () => {
    writeVersions({})
    const { status, output } = check('v1.2.4')
    expect(status).toBe(1)
    expect(output).toContain("tag 'v1.2.4'")
  })

  it('fails on a tag without the v prefix', () => {
    writeVersions({})
    expect(check('1.2.3').status).toBe(1)
  })

  it('fails when plugin.json differs from package.json', () => {
    writeVersions({ plugin: '1.2.2' })
    const { status, output } = check('v1.2.3')
    expect(status).toBe(1)
    expect(output).toContain('.claude-plugin/plugin.json')
  })

  it('fails when src/lib/version.ts differs from package.json', () => {
    writeVersions({ ts: '1.2.2' })
    const { status, output } = check('v1.2.3')
    expect(status).toBe(1)
    expect(output).toContain('src/lib/version.ts')
  })

  it('fails when src/lib/version.ts has no VERSION constant', () => {
    writeVersions({})
    writeFileSync(join(root, 'src/lib/version.ts'), 'export {}\n')
    expect(check('v1.2.3').status).toBe(1)
  })

  it('checks only the files when no tag is given', () => {
    writeVersions({})
    expect(check().status).toBe(0)
    writeVersions({ plugin: '9.9.9' })
    expect(check().status).toBe(1)
  })

  it('passes on this repository for its current version', () => {
    const { version } = require(join(REPO_ROOT, 'package.json'))
    const result = spawnSync(process.execPath, [SCRIPT, `v${version}`], {
      encoding: 'utf-8',
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})
