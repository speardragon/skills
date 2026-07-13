'use strict'

const fs = require('node:fs')
const path = require('node:path')

// The target folder conventions cdragon links into — the single source of truth
// for the CLI's flag handling, folder picker, and status matrix.
const FOLDERS = ['.claude', '.agents']

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

module.exports = { linkSkill, linkSkills, linkStatus, skillStatuses, FOLDERS }
