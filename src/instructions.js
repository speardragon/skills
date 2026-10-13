'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { linkStatus, unlinkSkill } = require('./link')
const { resolveSkillsDir } = require('./source')
const prompt = require('./prompt')

const TARGETS = {
  claude: '.claude/CLAUDE.md',
  codex: '.codex/AGENTS.md',
  gemini: '.gemini/GEMINI.md',
  grok: '.grok/AGENTS.md',
}

function resolveInstructionSource(opts) {
  if (opts.source) return path.resolve(opts.source)
  const source = path.resolve(resolveSkillsDir(opts), '../instructions/AGENTS.md')
  return fs.existsSync(source) ? source : path.resolve(__dirname, '../instructions/AGENTS.md')
}

function instructionStatus(source, base, agent) {
  const linkPath = path.join(base, TARGETS[agent])
  const status = linkStatus(source, linkPath)
  if (agent === 'grok' && status === 'none' &&
      linkStatus(source, path.join(base, TARGETS.claude)) === 'linked') {
    return { status: 'inherited', linkPath }
  }
  return { status, linkPath }
}

function linkInstruction(source, base, agent, { force = false } = {}) {
  if (!fs.statSync(source).isFile() || !fs.readFileSync(source, 'utf8').trim()) {
    throw new Error(`Instruction source must be a non-empty file: ${source}`)
  }
  const { status, linkPath } = instructionStatus(source, base, agent)
  if (status === 'linked') return { status: 'already', linkPath }
  if (status === 'inherited') return { status, linkPath }
  if (status !== 'none' && !force) return { status: 'exists', linkPath }

  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  let backup
  if (status !== 'none') {
    const backupRoot = path.join(path.dirname(linkPath), 'instructions-backup')
    fs.mkdirSync(backupRoot, { recursive: true })
    backup = path.join(backupRoot, path.basename(linkPath))
    for (let n = 2; fs.existsSync(backup) || isSymlink(backup); n++) {
      backup = path.join(backupRoot, `${path.basename(linkPath)}-${n}`)
    }
    fs.renameSync(linkPath, backup)
  }
  try {
    fs.symlinkSync(source, linkPath, 'file')
  } catch (err) {
    if (backup) fs.renameSync(backup, linkPath)
    throw err
  }
  return { status: backup ? 'replaced' : 'linked', linkPath, backup }
}

function isSymlink(file) {
  try { return fs.lstatSync(file).isSymbolicLink() } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

async function instructionsCommand(args) {
  let action = 'link'
  if (args[0] && !args[0].startsWith('-')) action = args.shift()
  if (!['link', 'status', 'unlink'].includes(action)) throw new Error(`Unknown instructions command: ${action}`)
  const opts = {}, agents = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--global' || arg === '-g') continue
    if (arg === '--all-targets') continue
    if (arg === '--force' || arg === '-f') opts.force = true
    else if (arg === '--yes' || arg === '-y') opts.yes = true
    else if (arg === '--offline') opts.offline = true
    else if (arg === '--refresh') opts.refresh = true
    else if (arg === '--source') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error('--source requires a file path')
      opts.source = args[++i]
    } else if (Object.hasOwn(TARGETS, arg.slice(2)) && arg.startsWith('--')) agents.push(arg.slice(2))
    else throw new Error(`Unknown instructions option: ${arg} (instructions support global scope only)`)
  }
  const selected = args.includes('--all-targets') || !agents.length
    ? Object.keys(TARGETS) : Object.keys(TARGETS).filter((agent) => agents.includes(agent))
  const source = resolveInstructionSource(opts)
  const base = os.homedir()
  if (action === 'link' && (!fs.statSync(source).isFile() || !fs.readFileSync(source, 'utf8').trim())) {
    throw new Error(`Instruction source must be a non-empty file: ${source}`)
  }
  console.log(`Source: ${source}`)
  for (const agent of selected) {
    const state = instructionStatus(source, base, agent)
    console.log(`  ${agent}: ${state.status} (${state.linkPath})`)
  }
  if (selected.includes('codex') && fs.existsSync(path.join(base, '.codex/AGENTS.override.md'))) {
    console.log('Warning: ~/.codex/AGENTS.override.md takes precedence over AGENTS.md.')
  }
  if (selected.includes('grok') && linkStatus(source, path.join(base, TARGETS.claude)) === 'linked' &&
      linkStatus(source, path.join(base, TARGETS.grok)) !== 'none') {
    console.log('Warning: Grok also loads Claude global instructions; check for duplicate rules.')
  }
  if (action === 'status') return
  if (!opts.yes && !await prompt.confirm(`${action} global instruction links${opts.force ? ' (back up existing entries)' : ''}?`, false)) return
  for (const agent of selected) {
    const result = action === 'link' ? linkInstruction(source, base, agent, opts)
      : { ...unlinkSkill(source, path.join(base, TARGETS[agent])), linkPath: path.join(base, TARGETS[agent]) }
    console.log(`  ${agent}: ${result.status}${result.backup ? ` (backup: ${result.backup})` : ''}`)
    if (result.status === 'exists') console.log('    Use --force to back up and replace this entry.')
    if (result.status === 'inherited') console.log('    Grok Build uses the shared ~/.claude/CLAUDE.md; no duplicate link created.')
  }
}

module.exports = { TARGETS, resolveInstructionSource, instructionStatus, linkInstruction, instructionsCommand }
