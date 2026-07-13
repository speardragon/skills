#!/usr/bin/env node
'use strict'

const path = require('node:path')
const os = require('node:os')

const pkg = require('../package.json')
const c = require('../src/colors')
const prompt = require('../src/prompt')
const { resolveSkillsDir, discoverSkills } = require('../src/skills')
const { linkSkills, skillStatuses } = require('../src/link')

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// One-character status marks, shared by the picker, the plan and `status`.
const MARK = {
  linked: c.green('✓'),
  stale: c.yellow('↻'),
  dir: c.yellow('!'),
  none: c.dim('—'),
}
const LEGEND = `${MARK.linked} linked  ${MARK.none} not installed  ${MARK.dir} real folder  ${MARK.stale} stale link`

// Compact per-folder tag, e.g. "[claude ✓ agents —]".
function statusTag(statuses) {
  return c.dim('[') + statuses.map((s) => `${s.folder.slice(1)} ${MARK[s.status]}`).join(' ') + c.dim(']')
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
    else if (a === '--both') opts.folders.push('.claude', '.agents')
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

  const folders = ['.claude', '.agents']
  const targets = [
    { label: 'global', base: os.homedir() },
    { label: 'project', base: process.cwd() },
  ]
  const width = Math.max(...skills.map((s) => s.name.length), 'skill'.length)
  const pad = (s) => `  ${s.padEnd(width)}`

  console.log(`\n${c.bold('Install status')}  ${c.dim(`project = ${process.cwd()}`)}`)
  console.log(`${' '.repeat(width + 2)}  ${c.bold('global')}${' '.repeat(12)}${c.bold('project')}`)
  console.log(`${' '.repeat(width + 2)}  ${c.dim('claude  agents')}    ${c.dim('claude  agents')}`)

  for (const skill of skills) {
    const cells = targets.flatMap((t) =>
      skillStatuses(skill, t.base, folders).map((s) => MARK[s.status])
    )
    console.log(`${pad(skill.name)}    ${cells[0]}       ${cells[1]}         ${cells[2]}       ${cells[3]}`)
  }
  console.log(`\n  ${LEGEND}\n`)
}

async function linkCommand(opts) {
  const skillsDir = resolveSkillsDir(opts)
  const skills = discoverSkills(skillsDir)
  if (!skills.length) throw new Error(`No skills found in ${skillsDir}`)

  // 1. Scope: project (cwd) or global (home).
  let scope = opts.scope
  if (!scope) {
    scope = await prompt.select('Install scope?', [
      { label: `project  ${c.dim('(current directory)')}`, value: 'project' },
      { label: `global   ${c.dim('(~/.claude, ~/.agents)')}`, value: 'global' },
    ])
  }

  // 2. Folder(s): .claude and/or .agents.
  let folders = opts.folders
  if (!folders.length) {
    folders = await prompt.multiselect('Which folder(s) to link into?', [
      { label: '.claude/skills', value: '.claude' },
      { label: '.agents/skills', value: '.agents' },
    ])
  }
  if (!folders.length) throw new Error('No target folder selected.')

  const base = scope === 'global' ? os.homedir() : process.cwd()

  // 3. Skills: all, named, or interactively picked.
  let chosen
  if (opts.all) {
    chosen = skills
  } else if (opts.skills.length) {
    chosen = opts.skills.map((name) => {
      const found = skills.find((s) => s.name === name)
      if (!found) throw new Error(`Unknown skill: ${name}`)
      return found
    })
  } else {
    const choices = []
    for (const group of groupBySource(skills)) {
      choices.push({ header: true, label: `${group.label} (${group.items.length})` })
      for (const s of group.items) {
        // Show per-folder status; pre-check skills linked in at least one target.
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
    chosen = picked.map((name) => skills.find((s) => s.name === name))
  }
  if (!chosen.length) throw new Error('No skills selected.')

  // Plan: what will happen at each skill × folder target.
  const plans = chosen.map((s) => ({ skill: s, statuses: skillStatuses(s, base, folders) }))
  const allStatuses = plans.flatMap((p) => p.statuses)
  const conflicts = allStatuses.filter((st) => st.status === 'dir').length

  const ACTION = {
    none: c.green('+ link   '),
    linked: c.dim('= already'),
    stale: c.yellow('↻ relink '),
    dir: c.yellow('! folder '),
  }
  const width = Math.max(...chosen.map((s) => s.name.length))

  console.log('')
  console.log(`  ${c.bold('scope')}    ${scope} ${c.dim(`(${base})`)}`)
  console.log(`  ${c.bold('folders')}  ${folders.join(', ')}`)
  console.log('')
  for (const p of plans) {
    const cells = p.statuses.map((st) => `${st.folder} ${ACTION[st.status]}`).join('   ')
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

  const icon = {
    linked: c.green('+ linked  '),
    relinked: c.green('↻ relinked'),
    replaced: c.green('± replaced'),
    already: c.dim('= already '),
    exists: c.yellow('! skipped '),
  }
  console.log('')
  for (const r of results) {
    let note = ''
    if (r.status === 'exists') note = c.yellow(' (real dir exists, use --force to replace)')
    if (r.status === 'replaced') note = c.dim(` (old folder → ${r.backup})`)
    console.log(`  ${icon[r.status]}  ${r.folder}/skills/${r.skill}${note}`)
  }

  const made = results.filter((r) => ['linked', 'relinked', 'replaced'].includes(r.status)).length
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
