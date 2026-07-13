'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const CLI = path.join(__dirname, '..', 'bin', 'cdragon.js')
let tmp

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdragon-cli-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

// Runs the CLI in the temp dir with a non-TTY stdin (spawnSync pipes stdin).
function run(args) {
  return spawnSync('node', [CLI, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    input: '',
    env: { ...process.env, CDRAGON_OFFLINE: '1', NO_COLOR: '1' },
  })
}

test('non-TTY: -y links a fresh target successfully', () => {
  const r = run(['-p', '--claude', 'tdd', '-y'])
  assert.equal(r.status, 0, r.stderr)
  const link = path.join(tmp, '.claude', 'skills', 'tdd')
  assert.ok(fs.lstatSync(link).isSymbolicLink())
})

test('non-TTY: real-folder conflict without -y/-f fails clearly, not silently', () => {
  const squat = path.join(tmp, '.claude', 'skills', 'tdd')
  fs.mkdirSync(squat, { recursive: true })
  fs.writeFileSync(path.join(squat, 'SKILL.md'), 'mine')

  const r = run(['-p', '--claude', 'tdd'])
  assert.notEqual(r.status, 0, 'should exit non-zero when it cannot prompt')
  assert.match(r.stderr + r.stdout, /TTY/i)
  assert.ok(fs.existsSync(path.join(squat, 'SKILL.md')), 'squatting folder untouched')
})

test('unlink -y removes our link but keeps a real folder', () => {
  run(['-p', '--claude', 'tdd', '-y'])
  const link = path.join(tmp, '.claude', 'skills', 'tdd')
  assert.ok(fs.lstatSync(link).isSymbolicLink())
  const real = path.join(tmp, '.claude', 'skills', 'to-html')
  fs.mkdirSync(real, { recursive: true })
  fs.writeFileSync(path.join(real, 'SKILL.md'), 'mine')

  const r = spawnSync('node', [CLI, 'unlink', '-p', '--claude', 'tdd', 'to-html', '-y'], {
    cwd: tmp, encoding: 'utf8', input: '',
    env: { ...process.env, CDRAGON_OFFLINE: '1', NO_COLOR: '1' },
  })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!fs.existsSync(link), 'our symlink removed')
  assert.ok(fs.existsSync(path.join(real, 'SKILL.md')), 'real folder kept')
})

test('prune -y removes a dangling repo-link, keeps a foreign link', () => {
  const root = path.join(tmp, '.claude', 'skills')
  fs.mkdirSync(root, { recursive: true })
  const repoSkills = path.join(__dirname, '..', 'skills')
  fs.symlinkSync(path.join(repoSkills, 'definitely-gone'), path.join(root, 'definitely-gone'), 'dir')
  fs.symlinkSync('/nope/foreign', path.join(root, 'foreign'), 'dir')

  const r = spawnSync('node', [CLI, 'prune', '-p', '-y'], {
    cwd: tmp, encoding: 'utf8', input: '',
    env: { ...process.env, CDRAGON_OFFLINE: '1', NO_COLOR: '1' },
  })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!fs.existsSync(path.join(root, 'definitely-gone')), 'dangling repo-link pruned')
  assert.ok(fs.lstatSync(path.join(root, 'foreign')).isSymbolicLink(), 'foreign link kept')
})

test('prune --claude honors the folder flag and leaves .agents orphans alone', () => {
  const repoSkills = path.join(__dirname, '..', 'skills')
  const claudeRoot = path.join(tmp, '.claude', 'skills')
  const agentsRoot = path.join(tmp, '.agents', 'skills')
  fs.mkdirSync(claudeRoot, { recursive: true })
  fs.mkdirSync(agentsRoot, { recursive: true })
  fs.symlinkSync(path.join(repoSkills, 'definitely-gone'), path.join(claudeRoot, 'definitely-gone'), 'dir')
  fs.symlinkSync(path.join(repoSkills, 'definitely-gone'), path.join(agentsRoot, 'definitely-gone'), 'dir')

  const r = spawnSync('node', [CLI, 'prune', '-p', '--claude', '-y'], {
    cwd: tmp, encoding: 'utf8', input: '',
    env: { ...process.env, CDRAGON_OFFLINE: '1', NO_COLOR: '1' },
  })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!fs.existsSync(path.join(claudeRoot, 'definitely-gone')), '.claude orphan pruned')
  assert.ok(fs.lstatSync(path.join(agentsRoot, 'definitely-gone')).isSymbolicLink(), '.agents orphan untouched')
})
