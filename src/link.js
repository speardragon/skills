'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Symlink one skill directory at linkPath. Never clobbers a real (non-symlink)
// entry. Returns a status: linked | relinked | already | exists.
function linkSkill(sourceDir, linkPath) {
  let stat
  try {
    stat = fs.lstatSync(linkPath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      fs.symlinkSync(sourceDir, linkPath, 'dir')
      return 'linked'
    }
    throw err
  }

  if (stat.isSymbolicLink()) {
    const current = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath))
    if (current === sourceDir) return 'already'
    fs.rmSync(linkPath)
    fs.symlinkSync(sourceDir, linkPath, 'dir')
    return 'relinked'
  }

  // A real file/dir already lives here — leave it untouched.
  return 'exists'
}

// Is `sourceDir` already symlinked at linkPath? (true only for a symlink that
// resolves to exactly this source — not a real dir, not a stale link.)
function isLinked(sourceDir, linkPath) {
  try {
    if (!fs.lstatSync(linkPath).isSymbolicLink()) return false
    return path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath)) === sourceDir
  } catch {
    return false
  }
}

// Is the skill already linked into <base>/<folder>/skills for every folder?
function isInstalledIn(skill, base, folders) {
  const name = path.basename(skill.dir)
  return folders.every((folder) => isLinked(skill.dir, path.join(base, folder, 'skills', name)))
}

// Link a set of skills into <base>/<folder>/skills, creating the dir if needed.
function linkSkills(skills, base, folder) {
  const root = path.join(base, folder, 'skills')
  fs.mkdirSync(root, { recursive: true })

  return skills.map((skill) => {
    const name = path.basename(skill.dir)
    return {
      skill: name,
      folder,
      status: linkSkill(skill.dir, path.join(root, name)),
    }
  })
}

module.exports = { linkSkill, linkSkills, isInstalledIn }
