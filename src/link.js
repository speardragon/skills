'use strict'

const fs = require('node:fs')
const path = require('node:path')

// The target folder conventions cdragon links into — the single source of truth
// for the CLI's flag handling, folder picker, and status matrix. Each target
// declares which scopes it's valid for: Antigravity reads ~/.gemini/skills
// globally but reuses .agents/skills per-project, so .gemini is global-only.
const TARGETS = [
  { folder: '.claude', scopes: ['global', 'project'] },
  { folder: '.agents', scopes: ['global', 'project'] },
  { folder: '.gemini', scopes: ['global'] },
]

// Every folder name, order preserved — for callers that don't care about scope.
const FOLDERS = TARGETS.map((t) => t.folder)

// Folders valid for a given scope ('global' | 'project').
function foldersForScope(scope) {
  return TARGETS.filter((t) => t.scopes.includes(scope)).map((t) => t.folder)
}

// What lives at linkPath, relative to sourceDir?
//   linked — symlink pointing at sourceDir
//   stale  — symlink pointing somewhere else
//   dir    — a real (non-symlink) file or directory
//   none   — nothing
function linkStatus(sourceDir, linkPath) {
  let stat
  try {
    stat = fs.lstatSync(linkPath)
  } catch (err) {
    if (err.code === 'ENOENT') return 'none'
    throw err
  }
  if (!stat.isSymbolicLink()) return 'dir'
  let target
  try {
    target = fs.readlinkSync(linkPath)
  } catch (err) {
    if (err.code === 'ENOENT') return 'none' // link vanished between lstat and readlink
    throw err
  }
  return path.resolve(path.dirname(linkPath), target) === sourceDir ? 'linked' : 'stale'
}

// Move a real directory out of the way so a symlink can take its place.
// Backups live in <folder>/skills-backup/ — outside skills/, so agents don't
// discover the backup's SKILL.md as a duplicate skill.
function backupDir(linkPath) {
  const backupRoot = path.join(path.dirname(path.dirname(linkPath)), 'skills-backup')
  fs.mkdirSync(backupRoot, { recursive: true })
  const name = path.basename(linkPath)
  let dest = path.join(backupRoot, name)
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(backupRoot, `${name}-${n}`)
  fs.renameSync(linkPath, dest)
  return dest
}

// Symlink one skill directory at linkPath. A real (non-symlink) entry is only
// clobbered when `replace` is set — it is moved to skills-backup/ first.
// Returns { status, backup? } with status:
// linked | relinked | already | replaced | exists.
function linkSkill(sourceDir, linkPath, { replace = false } = {}) {
  const status = linkStatus(sourceDir, linkPath)

  if (status === 'linked') return { status: 'already' }

  if (status === 'dir') {
    if (!replace) return { status: 'exists' }
    const backup = backupDir(linkPath)
    fs.symlinkSync(sourceDir, linkPath, 'dir')
    return { status: 'replaced', backup }
  }

  if (status === 'stale') fs.rmSync(linkPath)
  fs.symlinkSync(sourceDir, linkPath, 'dir')
  return { status: status === 'stale' ? 'relinked' : 'linked' }
}

// Per-folder install status of a skill under <base>/<folder>/skills.
function skillStatuses(skill, base, folders) {
  const name = path.basename(skill.dir)
  return folders.map((folder) => ({
    folder,
    status: linkStatus(skill.dir, path.join(base, folder, 'skills', name)),
  }))
}

// Link a set of skills into <base>/<folder>/skills, creating the dir if needed.
function linkSkills(skills, base, folder, opts) {
  const root = path.join(base, folder, 'skills')
  fs.mkdirSync(root, { recursive: true })

  return skills.map((skill) => {
    const name = path.basename(skill.dir)
    const { status, backup } = linkSkill(skill.dir, path.join(root, name), opts)
    return { skill: name, folder, status, backup }
  })
}

// Remove a skill's symlink ONLY if it currently points at sourceDir. Never
// touches real dirs or foreign/stale symlinks. Returns:
// unlinked | absent | not-ours.
function unlinkSkill(sourceDir, linkPath) {
  const status = linkStatus(sourceDir, linkPath)
  if (status === 'linked') {
    fs.rmSync(linkPath)
    return { status: 'unlinked' }
  }
  if (status === 'none') return { status: 'absent' }
  return { status: 'not-ours' }
}

function unlinkSkills(skills, base, folder) {
  const root = path.join(base, folder, 'skills')
  return skills.map((skill) => {
    const name = path.basename(skill.dir)
    const { status } = unlinkSkill(skill.dir, path.join(root, name))
    return { skill: name, folder, status }
  })
}

// Symlinks under <base>/<folder>/skills that point INTO sourceRoot but whose
// target no longer exists — leftovers from a skill removed or renamed in the
// repo. Foreign symlinks and real dirs are never reported.
function findOrphans(base, folders, sourceRoot) {
  const orphans = []
  for (const folder of folders) {
    const root = path.join(base, folder, 'skills')
    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue
      const linkPath = path.join(root, entry.name)
      let target
      try {
        target = path.resolve(root, fs.readlinkSync(linkPath))
      } catch {
        continue
      }
      const insideSource = target === sourceRoot || target.startsWith(sourceRoot + path.sep)
      if (insideSource && !fs.existsSync(target)) {
        orphans.push({ folder, name: entry.name, linkPath, target })
      }
    }
  }
  return orphans
}

module.exports = {
  linkSkill,
  linkSkills,
  linkStatus,
  skillStatuses,
  TARGETS,
  FOLDERS,
  foldersForScope,
  unlinkSkill,
  unlinkSkills,
  findOrphans,
}
