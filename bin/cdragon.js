#!/usr/bin/env node
'use strict'

const path = require('node:path')
const os = require('node:os')

const pkg = require('../package.json')
const c = require('../src/colors')
const prompt = require('../src/prompt')
const { resolveSkillsDir, discoverSkills } = require('../src/skills')
const { linkSkills, skillStatuses, FOLDERS } = require('../src/link')

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// Pre-state vocabulary (what linkStatus reports). One row per state: the glyph
// for the status matrix/picker, and the action label for the pre-link plan.
const STATE = {
  none:   { glyph: '—', color: c.dim,    action: '+ link   ', actionColor: c.green },
  linked: { glyph: '✓', color: c.green,  action: '= already', actionColor: c.dim },
  stale:  { glyph: '↻', color: c.yellow, action: '↻ relink ', actionColor: c.yellow },
  dir:    { glyph: '!', color: c.yellow, action: '! folder ', actionColor: c.yellow },
}
const mark = (st) => STATE[st].color(STATE[st].glyph)
// Pad the RAW glyph to width, THEN color — coloring adds zero visible width.
const markCell = (st, w) => STATE[st].color(STATE[st].glyph.padEnd(w))

const LEGEND = [
  ['linked', 'linked'], ['none', 'not installed'],
  ['dir', 'real folder'], ['stale', 'stale link'],
].map(([st, label]) => `${mark(st)} ${label}`).join('  ')

// Post-action vocabulary (what linkSkill returns after acting).
const OUTCOME = {
  linked:   { icon: c.green('+ linked  '), made: true },
  relinked: { icon: c.green('↻ relinked'), made: true },
  replaced: { icon: c.green('± replaced'), made: true },
  already:  { icon: c.dim('= already '),   made: false },
  exists:   { icon: c.yellow('! skipped '), made: false },
}

// Compact per-folder tag, e.g. "[claude ✓ agents —]".
function statusTag(statuses) {
  return c.dim('[') + statuses.map((s) => `${s.folder.slice(1)} ${mark(s.status)}`).join(' ') + c.dim(']')
}

// Split skills into ordered, non-empty groups by where they came from.
function groupBySource(skills) {
  return [
    { key: 'mine', label: 'My skills' },
    { key: 'installed', label: 'External' },
  ]
    .map((g) => ({ ...g, items: skills.filter((s) => s.source === g.key) }))
    .filter((g) => g.items.length)
}

function parseArgs(args) {
  const opts = { scope: null, folders: [], all: false, skills: [], yes: false, force: false }

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--global' || a === '-g') opts.scope = 'global'
    else if (a === '--project' || a === '-p') opts.scope = 'project'
    else if (a === '--claude') opts.folders.push('.claude')
    else if (a === '--agents') opts.folders.push('.agents')
    else if (a === '--both') opts.folders.push(...FOLDERS)
    else if (a === '--all' || a === '-a') opts.all = true
    else if (a === '--skills') opts.skills.push(...(args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean))
    else if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--force' || a === '-f') opts.force = true
    else if (a === '--offline' || a === '--refresh') continue // handled in main()
    else if (!a.startsWith('-')) opts.skills.push(a)
    else throw new Error(`Unknown option: ${a}`)
  }

  opts.folders = [...new Set(opts.folders)]
  return opts
}

function help() {
  console.log(`
${c.bold('cdragon')} — symlink this repo's agent skills into a target location

${c.bold('Usage')}
  cdragon                 Interactive: pick scope, folder(s) and skills to link
  cdragon [skills...]     Link named skills (skips the skill picker)
  cdragon status          Where is each skill installed? (global/project × .claude/.agents)
  cdragon list            List available skills
  cdragon help            Show this help

${c.bold('Flags')} ${c.dim('(skip the matching prompt)')}
  -p, --project           Link into the current directory ${c.dim('(default prompt)')}
  -g, --global            Link into your home dir (~/.claude, ~/.agents)
      --claude            Target .claude/skills
      --agents            Target .agents/skills
      --both              Target both
  -a, --all               Link every skill
      --skills a,b,c      Link a specific comma-separated set
  -y, --yes               Skip the confirmation prompt
  -f, --force             Replace real folders in the way ${c.dim('(moved to skills-backup/ first)')}
      --offline           Don't refresh the skills mirror over the network
      --refresh           Force-refresh the skills mirror now

${c.bold('Examples')}
  cdragon --project --claude --all -y
  cdragon -g --both tdd handoff
`)
}

function listSkills(syncOpts) {
  const skillsDir = resolveSkillsDir(syncOpts)
  const skills = discoverSkills(skillsDir)
  if (!skills.length) {
    console.log(c.yellow(`No skills found in ${skillsDir}`))
    return
  }
  const width = Math.max(...skills.map((s) => s.name.length))
  console.log(`\n${c.bold(`Skills (${skills.length})`)}  ${c.dim(skillsDir)}`)
  for (const group of groupBySource(skills)) {
    console.log(`\n  ${c.bold(group.label)} ${c.dim(`(${group.items.length})`)}`)
    for (const s of group.items) {
      console.log(`    ${c.cyan(s.name.padEnd(width))}  ${c.dim(truncate(s.description, 74))}`)
    }
  }
  console.log('')
}

// Matrix of every skill × (global, project) × (.claude, .agents).
function statusCommand(syncOpts) {
  const skillsDir = resolveSkillsDir(syncOpts)
  const skills = discoverSkills(skillsDir)
  if (!skills.length) {
    console.log(c.yellow(`No skills found in ${skillsDir}`))
    return
  }

  const targets = [
    { label: 'global', base: os.homedir() },
    { label: 'project', base: process.cwd() },
  ]
  // Column width = longest folder label (sans dot) + 3 spaces of gutter.
  const COL = Math.max(...FOLDERS.map((f) => f.slice(1).length)) + 3
  const nameW = Math.max(...skills.map((s) => s.name.length))
  const namePad = (s) => s.padEnd(nameW + 2)
  const groupW = COL * FOLDERS.length

  console.log(`\n${c.bold('Install status')}  ${c.dim(`project = ${process.cwd()}`)}`)
  console.log('  ' + namePad('') + targets.map((t) => c.bold(t.label.padEnd(groupW))).join(''))
  console.log('  ' + namePad('') + targets.map(() => FOLDERS.map((f) => c.dim(f.slice(1).padEnd(COL))).join('')).join(''))

  for (const skill of skills) {
    const cells = targets
      .flatMap((t) => skillStatuses(skill, t.base, FOLDERS).map((s) => s.status))
      .map((st) => markCell(st, COL))
      .join('')
    console.log('  ' + c.cyan(namePad(skill.name)) + cells)
  }
  console.log(`\n  ${LEGEND}\n`)
}

// Resolve scope + target folder(s) from flags, prompting for whatever's missing.
async function chooseTargets(opts) {
  let scope = opts.scope
  if (!scope) {
    scope = await prompt.select('Install scope?', [
      { label: `project  ${c.dim('(current directory)')}`, value: 'project' },
      { label: `global   ${c.dim('(~/.claude, ~/.agents)')}`, value: 'global' },
    ])
  }
  let folders = opts.folders
  if (!folders.length) {
    folders = await prompt.multiselect(
      'Which folder(s) to link into?',
      FOLDERS.map((f) => ({ label: `${f}/skills`, value: f }))
    )
  }
  if (!folders.length) throw new Error('No target folder selected.')
  const base = scope === 'global' ? os.homedir() : process.cwd()
  return { scope, folders, base }
}

// Resolve which skills to act on: --all, explicit names, or interactive pick.
async function chooseSkills(opts, skills, base, folders) {
  if (opts.all) return skills
  if (opts.skills.length) {
    return opts.skills.map((name) => {
      const found = skills.find((s) => s.name === name)
      if (!found) throw new Error(`Unknown skill: ${name}`)
      return found
    })
  }
  const choices = []
  for (const group of groupBySource(skills)) {
    choices.push({ header: true, label: `${group.label} (${group.items.length})` })
    for (const s of group.items) {
      const statuses = skillStatuses(s, base, folders)
      choices.push({
        value: s.name,
        checked: statuses.some((st) => st.status === 'linked'),
        label: `${s.name}  ${statusTag(statuses)}  ${c.dim(truncate(s.description, 44))}`,
      })
    }
  }
  console.log(`  ${c.dim(LEGEND)}`)
  const picked = await prompt.multiselect('Which skills to link?', choices)
  return picked.map((name) => skills.find((s) => s.name === name))
}

async function linkCommand(opts) {
  const skillsDir = resolveSkillsDir(opts)
  const skills = discoverSkills(skillsDir)
  if (!skills.length) throw new Error(`No skills found in ${skillsDir}`)

  const { scope, folders, base } = await chooseTargets(opts)
  const chosen = await chooseSkills(opts, skills, base, folders)
  if (!chosen.length) throw new Error('No skills selected.')

  // Plan: what will happen at each skill × folder target.
  const plans = chosen.map((s) => ({ skill: s, statuses: skillStatuses(s, base, folders) }))
  const allStatuses = plans.flatMap((p) => p.statuses)
  const conflicts = allStatuses.filter((st) => st.status === 'dir').length

  const width = Math.max(...chosen.map((s) => s.name.length))

  console.log('')
  console.log(`  ${c.bold('scope')}    ${scope} ${c.dim(`(${base})`)}`)
  console.log(`  ${c.bold('folders')}  ${folders.join(', ')}`)
  console.log('')
  for (const p of plans) {
    const cells = p.statuses
      .map((st) => `${st.folder} ${STATE[st.status].actionColor(STATE[st.status].action)}`)
      .join('   ')
    console.log(`  ${c.cyan(p.skill.name.padEnd(width))}  ${cells}`)
  }
  console.log('')

  if (allStatuses.every((st) => st.status === 'linked')) {
    console.log(c.green('Everything already linked. Nothing to do.\n'))
    return
  }

  // Real folders in the way: replace only with --force or explicit consent.
  let replace = opts.force
  if (conflicts && !replace && !opts.yes) {
    replace = await prompt.confirm(
      `${conflicts} target(s) are real folders. Replace with symlinks? ${c.dim('(originals move to skills-backup/)')}`,
      false
    )
  }
  if (conflicts && !replace) {
    console.log(c.yellow(`  ${conflicts} real folder(s) will be skipped — pass --force to replace them.`))
  }

  if (!opts.yes) {
    const ok = await prompt.confirm('Proceed?', true)
    if (!ok) {
      console.log(c.dim('Aborted.'))
      return
    }
  }

  // Link + report.
  const results = []
  for (const folder of folders) results.push(...linkSkills(chosen, base, folder, { replace }))

  console.log('')
  for (const r of results) {
    let note = ''
    if (r.status === 'exists') note = c.yellow(' (real dir exists, use --force to replace)')
    if (r.status === 'replaced') note = c.dim(` (old folder → ${r.backup})`)
    console.log(`  ${OUTCOME[r.status].icon}  ${r.folder}/skills/${r.skill}${note}`)
  }
  const made = results.filter((r) => OUTCOME[r.status].made).length
  console.log(`\n${c.green(`Done. ${made} symlink(s) created/updated.`)}\n`)
}

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : null
  const syncOpts = { offline: argv.includes('--offline'), refresh: argv.includes('--refresh') }

  if (cmd === 'help' || argv.includes('--help') || argv.includes('-h')) return help()
  if (argv.includes('--version') || argv.includes('-v')) return console.log(pkg.version)
  if (cmd === 'list' || cmd === 'ls') return listSkills(syncOpts)
  if (cmd === 'status' || cmd === 'st') return statusCommand(syncOpts)

  const rest = cmd === 'link' ? argv.slice(1) : argv
  await linkCommand({ ...parseArgs(rest), ...syncOpts })
}

main().catch((err) => {
  console.error(c.red(`✖ ${err.message}`))
  process.exit(1)
})
