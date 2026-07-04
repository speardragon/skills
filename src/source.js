'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Skills bundled at publish time. Used directly when running from a git
// checkout (this repo itself via `npm link`, or the curl-install clone at
// ~/.cdragon) — in both cases the checkout IS the source of truth and the
// user updates it themselves (edit locally, or `git pull` / re-run install.sh).
const PKG_ROOT = path.resolve(__dirname, '..')
const BUNDLED_SKILLS_DIR = path.join(PKG_ROOT, 'skills')

// Where npm/npx installs mirror the skills repo. The CLI code there lives in
// an ephemeral or rarely-updated location (global node_modules, npx cache),
// so skill *content* is kept fresh independently via a cheap background
// `git pull`, instead of depending on how recently the npm package itself
// was published or reinstalled.
const MIRROR_DIR = process.env.CDRAGON_MIRROR || path.join(os.homedir(), '.cdragon-mirror')
const SYNC_MARKER = path.join(MIRROR_DIR, '.last-sync')
const REPO_URL = process.env.CDRAGON_REPO || 'https://github.com/speardragon/skills.git'
const SYNC_INTERVAL_MS = 60 * 60 * 1000 // don't hit the network more than once an hour
const CLONE_TIMEOUT_MS = 15000
const PULL_TIMEOUT_MS = 5000

function isGitCheckout(dir) {
  return fs.existsSync(path.join(dir, '.git'))
}

function hasGit() {
  const r = spawnSync('git', ['--version'], { stdio: 'ignore' })
  return !r.error && r.status === 0
}

function needsSync() {
  try {
    return Date.now() - fs.statSync(SYNC_MARKER).mtimeMs > SYNC_INTERVAL_MS
  } catch {
    return true // never synced
  }
}

function touchMarker() {
  try {
    fs.mkdirSync(MIRROR_DIR, { recursive: true })
    fs.writeFileSync(SYNC_MARKER, '')
  } catch {
    // best-effort; a missed marker just means we retry sync next run
  }
}

// Clone or fast-forward the mirror. Never throws — any failure (offline, no
// git, a corrupt or diverged checkout) just leaves whatever is already on
// disk in place, and resolveSkillsDir() falls back from there.
function syncMirror() {
  if (!hasGit()) return

  const isValid = isGitCheckout(MIRROR_DIR) && fs.existsSync(path.join(MIRROR_DIR, 'skills'))
  if (!isValid) {
    fs.rmSync(MIRROR_DIR, { recursive: true, force: true })
    spawnSync('git', ['clone', '--depth', '1', '--quiet', REPO_URL, MIRROR_DIR], {
      stdio: 'ignore',
      timeout: CLONE_TIMEOUT_MS,
    })
  } else {
    spawnSync('git', ['-C', MIRROR_DIR, 'pull', '--ff-only', '--quiet'], {
      stdio: 'ignore',
      timeout: PULL_TIMEOUT_MS,
    })
  }
  touchMarker()
}

// Resolve the directory to read skills from, refreshing the mirror first
// when applicable. `offline` skips the network sync and just uses whatever
// is already on disk; `refresh` forces a sync even within the throttle window.
function resolveSkillsDir({ offline = false, refresh = false } = {}) {
  if (isGitCheckout(PKG_ROOT)) return BUNDLED_SKILLS_DIR

  const skipSync = offline || Boolean(process.env.CDRAGON_OFFLINE)
  if (!skipSync && (refresh || needsSync())) syncMirror()

  const mirrorSkills = path.join(MIRROR_DIR, 'skills')
  return fs.existsSync(mirrorSkills) ? mirrorSkills : BUNDLED_SKILLS_DIR
}

module.exports = { resolveSkillsDir, BUNDLED_SKILLS_DIR, MIRROR_DIR }
