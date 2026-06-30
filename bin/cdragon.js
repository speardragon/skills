#!/usr/bin/env node
'use strict'

const path = require('node:path')
const os = require('node:os')

const pkg = require('../package.json')
const c = require('../src/colors')
const prompt = require('../src/prompt')
const { SKILLS_DIR, discoverSkills } = require('../src/skills')
const { linkSkills, isInstalledIn } = require('../src/link')

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

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
  const opts = { scope: null, folders: [], all: false, skills: [], yes: false }

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

${c.bold('Examples')}
  cdragon --project --claude --all -y
  cdragon -g --both tdd handoff
`)
}

function listSkills() {
  const skills = discoverSkills(SKILLS_DIR)
  if (!skills.length) {
    console.log(c.yellow(`No skills found in ${SKILLS_DIR}`))
    return
  }
  const width = Math.max(...skills.map((s) => s.name.length))
  console.log(`\n${c.bold(`Skills (${skills.length})`)}  ${c.dim(SKILLS_DIR)}`)
  for (const group of groupBySource(skills)) {
    console.log(`\n  ${c.bold(group.label)} ${c.dim(`(${group.items.length})`)}`)
    for (const s of group.items) {
      console.log(`    ${c.cyan(s.name.padEnd(width))}  ${c.dim(truncate(s.description, 74))}`)
    }
  }
  console.log('')
}

async function linkCommand(opts) {
  const skills = discoverSkills(SKILLS_DIR)
  if (!skills.length) throw new Error(`No skills found in ${SKILLS_DIR}`)

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
        // Pre-check skills already linked into the chosen target.
        const installed = isInstalledIn(s, base, folders)
        const tag = installed ? c.dim(' (linked)') : ''
        choices.push({
          value: s.name,
          checked: installed,
          label: `${s.name}  ${c.dim(truncate(s.description, 56))}${tag}`,
        })
      }
    }
    const picked = await prompt.multiselect('Which skills to link?', choices)
    chosen = picked.map((name) => skills.find((s) => s.name === name))
  }
  if (!chosen.length) throw new Error('No skills selected.')

  // Summary + confirm.
  console.log('')
  console.log(`  ${c.bold('scope')}    ${scope} ${c.dim(`(${base})`)}`)
  console.log(`  ${c.bold('folders')}  ${folders.join(', ')}`)
  console.log(`  ${c.bold('skills')}   ${chosen.map((s) => s.name).join(', ')}`)
  console.log('')

  if (!opts.yes) {
    const ok = await prompt.confirm(`Create ${chosen.length * folders.length} symlink(s)?`, true)
    if (!ok) {
      console.log(c.dim('Aborted.'))
      return
    }
  }

  // Link + report.
  const results = []
  for (const folder of folders) results.push(...linkSkills(chosen, base, folder))

  const icon = {
    linked: c.green('+ linked  '),
    relinked: c.green('↻ relinked'),
    already: c.dim('= already '),
    exists: c.yellow('! skipped '),
  }
  console.log('')
  for (const r of results) {
    const note = r.status === 'exists' ? c.yellow(' (real dir exists, not touched)') : ''
    console.log(`  ${icon[r.status]}  ${r.folder}/skills/${r.skill}${note}`)
  }

  const made = results.filter((r) => r.status === 'linked' || r.status === 'relinked').length
  console.log(`\n${c.green(`Done. ${made} symlink(s) created/updated.`)}\n`)
}

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : null

  if (cmd === 'help' || argv.includes('--help') || argv.includes('-h')) return help()
  if (argv.includes('--version') || argv.includes('-v')) return console.log(pkg.version)
  if (cmd === 'list' || cmd === 'ls') return listSkills()

  const rest = cmd === 'link' ? argv.slice(1) : argv
  await linkCommand(parseArgs(rest))
}

main().catch((err) => {
  console.error(c.red(`✖ ${err.message}`))
  process.exit(1)
})
