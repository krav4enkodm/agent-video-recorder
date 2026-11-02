#!/usr/bin/env bash
# Packs the package, installs the tarball into an empty project and records a
# scenario through the installed `avr` bin. Catches files missing from `files`,
# dependencies that only resolve inside this repo, and a broken build.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() {
  echo "smoke-pack: $*" >&2
  exit 1
}

cd "$root"
listing="$(npm pack --dry-run --json 2>/dev/null)"
leaked="$(node -e '
  const [{ files }] = JSON.parse(process.argv[1])
  const bad = files.map((f) => f.path).filter((p) => /^(src|test|tasks|skills)\//.test(p))
  process.stdout.write(bad.join("\n"))
' "$listing")"
[ -z "$leaked" ] || fail "tarball contains files it should not:
$leaked"

tarball="$(npm pack --pack-destination "$tmp" --json | node -e '
  let s = ""
  process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s)[0].filename))
')"

project="$tmp/project"
mkdir "$project"
cd "$project"
echo '{ "name": "avr-smoke", "private": true }' > package.json
npm install --no-audit --no-fund --loglevel=error "$tmp/$tarball"

version="$(npx avr --version)"
echo "avr --version: $version"
expected="$(node -p 'require(process.argv[1]).version' "$root/package.json")"
[ "$version" = "$expected" ] || fail "avr --version printed '$version', expected '$expected'"

cp "$root/test/fixtures/smoke.scenario.ts" "$root/test/fixtures/demo-app.html" "$tmp/"
out="$(npx avr record "$tmp/smoke.scenario.ts" --out "$tmp/out.mp4")"
echo "$out"
echo "$out" | tail -n 1 | node -e '
  let s = ""
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const result = JSON.parse(s)
    if (typeof result.path !== "string") throw new Error("result has no path")
  })
' || fail "avr record did not print a JSON result with path"
[ -s "$tmp/out.mp4" ] || fail "no video at $tmp/out.mp4"

echo "smoke-pack: ok"
