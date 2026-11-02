#!/usr/bin/env node
// Fails unless every place that states the package version agrees, and, when a
// tag is given, the tag is exactly `v` + that version. The release workflow
// runs it before publishing.
//
//   node scripts/check-release-version.mjs [tag] [--root <dir>]
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
let root = join(dirname(fileURLToPath(import.meta.url)), '..')
let tag
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root') root = args[++i]
  else tag = args[i]
}

const errors = []

function read(file) {
  try {
    return readFileSync(join(root, file), 'utf-8')
  } catch (err) {
    errors.push(`cannot read ${file}: ${err.message}`)
    return undefined
  }
}

function jsonVersion(file) {
  const text = read(file)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text).version
  } catch (err) {
    errors.push(`cannot parse ${file}: ${err.message}`)
    return undefined
  }
}

const version = jsonVersion('package.json')
if (version !== undefined && typeof version !== 'string') {
  errors.push('package.json has no version')
}

const pluginVersion = jsonVersion('.claude-plugin/plugin.json')
const versionTs = read('src/lib/version.ts')
const tsVersion = versionTs?.match(
  /export const VERSION = ['"]([^'"]+)['"]/,
)?.[1]
if (versionTs !== undefined && tsVersion === undefined) {
  errors.push('src/lib/version.ts has no `export const VERSION = ...`')
}

if (typeof version === 'string') {
  if (pluginVersion !== undefined && pluginVersion !== version) {
    errors.push(
      `.claude-plugin/plugin.json version '${pluginVersion}' does not match package.json version '${version}'`,
    )
  }
  if (tsVersion !== undefined && tsVersion !== version) {
    errors.push(
      `src/lib/version.ts VERSION '${tsVersion}' does not match package.json version '${version}'`,
    )
  }
  if (tag !== undefined && tag !== `v${version}`) {
    errors.push(
      `tag '${tag}' does not match package.json version (expected 'v${version}')`,
    )
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`check-release-version: ${e}`)
  process.exit(1)
}
console.log(
  `check-release-version: ok, version ${version}${tag ? `, tag ${tag}` : ''}`,
)
