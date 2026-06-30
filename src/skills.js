'use strict'

const fs = require('node:fs')
const path = require('node:path')

// The skills live next to this CLI, in <repo>/skills. Resolved from the install
// location so `cdragon` finds them no matter where it's invoked.
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills')

// skills-lock.json (managed by the `skills` CLI) is the manifest of skills
// pulled from external sources. Anything not listed there is authored locally.
const LOCK_PATH = path.resolve(SKILLS_DIR, '..', 'skills-lock.json')

function installedSkillNames() {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'))
    return new Set(Object.keys(lock.skills || {}))
  } catch {
    return new Set()
  }
}

// Parse the YAML frontmatter of a SKILL.md into a flat key/value map.
// Handles plain `key: value` and block scalars (`>`, `|`) used for long
// descriptions, collapsing them into a single line.
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const lines = match[1].split('\n')
  const out = {}

  for (let i = 0; i < lines.length; i++) {
    const keyMatch = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!keyMatch) continue

    const key = keyMatch[1]
    let value = keyMatch[2]

    if (value === '' || value === '>' || value === '|' || value === '>-' || value === '|-') {
      // Collect indented continuation lines (block scalar body).
      const buffer = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+\S/.test(lines[j]) || lines[j].trim() === '') {
          buffer.push(lines[j].trim())
          i = j
        } else {
          break
        }
      }
      value = buffer.join(' ').replace(/\s+/g, ' ').trim()
    } else {
      value = value.replace(/^["']|["']$/g, '')
    }

    out[key] = value
  }

  return out
}

// Discover every skill directory (one containing a SKILL.md) under a root.
function discoverSkills(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const installed = installedSkillNames()
  const skills = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillMd = path.join(dir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillMd)) continue

    const fm = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'))
    skills.push({
      name: entry.name,
      dir: path.join(dir, entry.name),
      description: fm.description || '',
      source: installed.has(entry.name) ? 'installed' : 'mine',
    })
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

module.exports = { SKILLS_DIR, discoverSkills, parseFrontmatter }
