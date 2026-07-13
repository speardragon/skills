# cdragon Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `cdragon` CLI reliable and maintainable for long-term personal use and external distribution — fix the correctness bugs found in review, add a test harness, complete the install→inspect→update→remove/clean lifecycle, consolidate duplicated presentation code, and ship it.

**Architecture:** `cdragon` is a zero-dependency Node CLI. `bin/cdragon.js` is the command router + interactive/presentation layer; `src/link.js` holds the pure-ish filesystem operations (symlink state machine); `src/prompt.js` has the readline prompts; `src/skills.js`/`src/source.js` discover and resolve the skills directory. All new logic lands in `src/link.js` as testable functions, with `bin/` staying a thin orchestration layer. Tests use Node's built-in `node:test` against real temp directories (no new dependencies).

**Tech Stack:** Node.js ≥18 (CommonJS), `node:test` + `node:assert/strict`, `node:fs`/`node:path`/`node:os`, `node:child_process` for CLI-level tests. No third-party packages (the repo is intentionally dependency-free).

## Global Constraints

- **Zero runtime dependencies.** Do not add any package to `package.json` dependencies. Tests use only Node built-ins.
- **Node ≥18** (`engines.node`), CommonJS (`require`/`module.exports`), `'use strict'` at the top of every source file.
- **Immutability where practical** (per `~/.claude/rules/coding-style.md`): return new objects; the one sanctioned mutation surface is the filesystem itself.
- **Never clobber user data.** A real (non-symlink) directory is only replaced with `--force`, and only after moving the original into `skills-backup/`. `unlink`/`prune` remove only symlinks that point into this repo — never real dirs, never foreign symlinks.
- **`files` allowlist** in `package.json` is `["bin","src","skills"]` — tests live in `test/` and must NOT be added to it (they stay out of the published package automatically).
- **Colors are ANSI-wrapped** via `src/colors.js`; they auto-disable when piped or `NO_COLOR` is set. When padding colored strings for column alignment, pad the RAW string first, then wrap with color — never `padEnd` an already-colored string (the invisible escape codes break width math).
- **Commit style** (per `~/.claude/rules/git-workflow.md`): `<type>: <description>`, types `feat|fix|refactor|docs|test|chore`. Attribution disabled globally.
- **Release bumps minor** (`0.3.0 → 0.4.0`): this batch adds new commands (`status`, `unlink`, `prune`) and a flag (`--force`), which is a feature release under semver.

---

## File Structure

**Created:**
- `test/link.test.js` — unit tests for `src/link.js` pure functions (symlink state machine, backup, orphan detection) against temp dirs.
- `test/cli.test.js` — end-to-end tests spawning `bin/cdragon.js` as a child process (non-TTY behavior, `prune`).

**Modified:**
- `package.json` — add `scripts.test`.
- `src/link.js` — fix `linkStatus` error handling; add `FOLDERS` constant, `unlinkSkill`/`unlinkSkills`, `findOrphans`.
- `src/prompt.js` — add `requireTTY()` guard to `confirm`.
- `bin/cdragon.js` — consolidate status vocabulary (`STATE`/`OUTCOME` maps), use `FOLDERS`, rework `statusCommand` alignment, extract `chooseTargets`/`chooseSkills`/`reportResults` from `linkCommand`, add `unlinkCommand`/`pruneCommand` + routing, add `fs` import.
- `README.md` — document `status`/`unlink`/`prune`/`--force`.

---

## Task 1: Test harness + characterization tests

Establishes the safety net before any change. These tests capture the CURRENT correct behavior of the symlink state machine, so later refactors can't silently break it.

**Files:**
- Modify: `package.json` (add `scripts` block)
- Create: `test/link.test.js`

**Interfaces:**
- Consumes: `src/link.js` exports `{ linkSkill, linkStatus, skillStatuses }` (current signatures: `linkStatus(sourceDir, linkPath) → 'none'|'linked'|'stale'|'dir'`; `linkSkill(sourceDir, linkPath, {replace}?) → {status, backup?}`; `skillStatuses(skill, base, folders) → [{folder, status}]`).
- Produces: `npm test` runs `node --test`; a reusable temp-dir fixture pattern for later tasks.

- [ ] **Step 1: Add the test script to package.json**

Insert a `scripts` block after the `"bin"` block (after line 7):

```json
  "scripts": {
    "test": "node --test"
  },
```

The file becomes (top portion):

```json
{
  "name": "cdragon",
  "version": "0.3.0",
  "description": "Symlink this repo's agent skills into a project's or your global .claude/skills or .agents/skills",
  "bin": {
    "cdragon": "bin/cdragon.js"
  },
  "scripts": {
    "test": "node --test"
  },
  "type": "commonjs",
```

- [ ] **Step 2: Write the characterization tests**

Create `test/link.test.js`:

```js
'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { linkSkill, linkStatus, skillStatuses } = require('../src/link')

let tmp, source, target

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdragon-test-'))
  source = path.join(tmp, 'repo', 'skills', 'demo')
  fs.mkdirSync(source, { recursive: true })
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: demo\n---\n')
  target = path.join(tmp, 'target', 'skills')
  fs.mkdirSync(target, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('linkStatus: none when nothing exists', () => {
  assert.equal(linkStatus(source, path.join(target, 'demo')), 'none')
})

test('linkSkill: none -> linked, creates symlink to source', () => {
  const linkPath = path.join(target, 'demo')
  assert.deepEqual(linkSkill(source, linkPath), { status: 'linked' })
  assert.equal(fs.readlinkSync(linkPath), source)
  assert.equal(linkStatus(source, linkPath), 'linked')
})

test('linkSkill: linked -> already (idempotent)', () => {
  const linkPath = path.join(target, 'demo')
  linkSkill(source, linkPath)
  assert.deepEqual(linkSkill(source, linkPath), { status: 'already' })
})

test('linkSkill: stale -> relinked, repoints to source', () => {
  const linkPath = path.join(target, 'demo')
  fs.symlinkSync(path.join(tmp, 'elsewhere'), linkPath, 'dir')
  assert.equal(linkStatus(source, linkPath), 'stale')
  assert.deepEqual(linkSkill(source, linkPath), { status: 'relinked' })
  assert.equal(fs.readlinkSync(linkPath), source)
})

test('linkSkill: real dir -> exists (untouched) without replace', () => {
  const linkPath = path.join(target, 'demo')
  fs.mkdirSync(linkPath)
  fs.writeFileSync(path.join(linkPath, 'keep.txt'), 'mine')
  assert.deepEqual(linkSkill(source, linkPath), { status: 'exists' })
  assert.ok(fs.existsSync(path.join(linkPath, 'keep.txt')))
  assert.ok(!fs.lstatSync(linkPath).isSymbolicLink())
})

test('linkSkill: real dir -> replaced with backup when replace=true', () => {
  const linkPath = path.join(target, 'demo')
  fs.mkdirSync(linkPath)
  fs.writeFileSync(path.join(linkPath, 'keep.txt'), 'mine')
  const res = linkSkill(source, linkPath, { replace: true })
  assert.equal(res.status, 'replaced')
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink())
  assert.ok(fs.existsSync(path.join(res.backup, 'keep.txt')))
  assert.equal(path.basename(path.dirname(res.backup)), 'skills-backup')
})

test('backup collision: second replace gets a -2 suffix', () => {
  const linkPath = path.join(target, 'demo')
  fs.mkdirSync(linkPath)
  linkSkill(source, linkPath, { replace: true })
  fs.rmSync(linkPath)
  fs.mkdirSync(linkPath)
  const res = linkSkill(source, linkPath, { replace: true })
  assert.equal(path.basename(res.backup), 'demo-2')
})

test('skillStatuses reports per-folder status', () => {
  const base = path.join(tmp, 'target')
  fs.mkdirSync(path.join(base, '.claude', 'skills'), { recursive: true })
  linkSkill(source, path.join(base, '.claude', 'skills', 'demo'))
  const statuses = skillStatuses({ dir: source }, base, ['.claude', '.agents'])
  assert.deepEqual(statuses, [
    { folder: '.claude', status: 'linked' },
    { folder: '.agents', status: 'none' },
  ])
})
```

- [ ] **Step 3: Run the tests — expect all green**

Run: `npm test`
Expected: `# pass 8`, `# fail 0` (all characterization tests pass against current code).

- [ ] **Step 4: Commit**

```bash
git add package.json test/link.test.js
git commit -m "test: add node:test harness and characterization tests for link.js"
```

---

## Task 2: Fix `linkStatus` error handling (correctness)

`linkStatus` currently maps EVERY `lstatSync` error to `'none'` (masking EACCES/ENOTDIR as "not installed"), and calls `readlinkSync` outside the try (a mid-check symlink deletion throws an uncaught ENOENT and crashes the whole command, including read-only `status`). Fix both: only ENOENT means "nothing there"; rethrow other lstat errors; guard the readlink race.

**Files:**
- Modify: `src/link.js` (`linkStatus`, lines 10-22)
- Modify: `test/link.test.js` (add failing tests first)

**Interfaces:**
- Produces: `linkStatus(sourceDir, linkPath)` — unchanged signature/return values, but now throws on non-ENOENT lstat errors and returns `'none'` (not a crash) if the symlink vanishes between `lstat` and `readlink`.

- [ ] **Step 1: Write the failing test**

Append to `test/link.test.js`:

```js
test('linkStatus: rethrows non-ENOENT errors instead of reporting none', () => {
  // A regular file where a directory is expected -> lstat of a child throws ENOTDIR.
  const notADir = path.join(tmp, 'afile')
  fs.writeFileSync(notADir, 'x')
  const linkPath = path.join(notADir, 'skills', 'demo')
  assert.throws(() => linkStatus(source, linkPath), (err) => err.code === 'ENOTDIR')
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npm test`
Expected: the new test FAILS — current code swallows ENOTDIR and returns `'none'`, so `assert.throws` reports "Missing expected exception."

- [ ] **Step 3: Fix `linkStatus`**

Replace the current `linkStatus` (src/link.js lines 10-22) with:

```js
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
```

- [ ] **Step 4: Run tests — expect all green**

Run: `npm test`
Expected: all pass (9 tests). The ENOTDIR test now passes; all characterization tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/link.js test/link.test.js
git commit -m "fix: linkStatus rethrows non-ENOENT errors and guards readlink race"
```

---

## Task 3: `confirm` requires a TTY + CLI test harness (correctness)

`prompt.confirm` has no `requireTTY()` guard (unlike `select`/`multiselect`), so in a non-interactive shell it exits 0 silently without linking — a script hitting the `--force` conflict prompt without `-y`/`-f` gets a false "success." Add the guard and a child-process test harness that verifies real CLI behavior.

**Files:**
- Modify: `src/prompt.js` (`confirm`, line 135)
- Create: `test/cli.test.js`

**Interfaces:**
- Consumes: `bin/cdragon.js` as a spawned process; `CDRAGON_OFFLINE=1` and `NO_COLOR=1` env for deterministic output; the repo's own `skills/tdd` (any real skill) as link source.
- Produces: `requireTTY()` now throws "Interactive prompt needs a TTY…" from `confirm` when stdin isn't a TTY, caught by `main().catch` → stderr + exit 1.

- [ ] **Step 1: Write the CLI test harness with a failing test**

Create `test/cli.test.js`:

```js
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
```

- [ ] **Step 2: Run it — expect the conflict test to FAIL**

Run: `npm test`
Expected: `non-TTY: -y links…` passes; `non-TTY: real-folder conflict…` FAILS — current `confirm` returns silently, so the process exits 0 with no "TTY" message.

- [ ] **Step 3: Add the TTY guard to `confirm`**

In `src/prompt.js`, add `requireTTY()` as the first line of `confirm` (line 135):

```js
function confirm(message, defaultYes = true) {
  requireTTY()
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const hint = defaultYes ? 'Y/n' : 'y/N'
  return new Promise((resolve) => {
```

- [ ] **Step 4: Run tests — expect all green**

Run: `npm test`
Expected: all pass. The conflict test now sees a non-zero exit and a "TTY" message; the squatting folder is untouched.

- [ ] **Step 5: Commit**

```bash
git add src/prompt.js test/cli.test.js
git commit -m "fix: confirm requires a TTY so non-interactive runs fail loudly"
```

---

## Task 4: Consolidate status vocabulary + `FOLDERS` constant + fix status-table alignment (cleanup)

Three hand-maintained status→display maps (`MARK`, `ACTION`, the results `icon`) and a separately hardcoded `made` list drift independently; the target-folder pair `['.claude','.agents']` is duplicated in three places; and the `status` matrix uses hand-counted spacing that only works because both folder labels are 6 chars. Collapse into one `STATE` table (pre-states) + one `OUTCOME` table (post-actions), a shared `FOLDERS` constant, and computed column widths.

**Files:**
- Modify: `src/link.js` (add + export `FOLDERS`)
- Modify: `bin/cdragon.js` (`MARK`/`LEGEND`/`statusTag`, `parseArgs`, `statusCommand`, plan/report sections of `linkCommand`)

**Interfaces:**
- Consumes: `require('../src/link')` now also exports `FOLDERS`.
- Produces: `STATE` (keys `none|linked|stale|dir`, each `{glyph, color, action, actionColor}`), `OUTCOME` (keys `linked|relinked|replaced|already|exists`, each `{icon, made}`), helpers `mark(state)` and `markCell(state, width)`. `statusCommand` renders columns from `FOLDERS × targets` with computed padding.

- [ ] **Step 1: Add and export `FOLDERS` in `src/link.js`**

Add near the top of `src/link.js` (after the `require`s):

```js
// The target folder conventions cdragon links into — the single source of truth
// for the CLI's flag handling, folder picker, and status matrix.
const FOLDERS = ['.claude', '.agents']
```

Update the exports line at the bottom:

```js
module.exports = { linkSkill, linkSkills, linkStatus, skillStatuses, FOLDERS }
```

- [ ] **Step 2: Replace the status maps and helpers in `bin/cdragon.js`**

Update the import to pull in `FOLDERS`:

```js
const { resolveSkillsDir, discoverSkills } = require('../src/skills')
const { linkSkills, skillStatuses, FOLDERS } = require('../src/link')
```

Replace the current `MARK`/`LEGEND` block (bin/cdragon.js ~lines 15-27) with:

```js
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
```

Update `statusTag` (uses `mark` now):

```js
function statusTag(statuses) {
  return c.dim('[') + statuses.map((s) => `${s.folder.slice(1)} ${mark(s.status)}`).join(' ') + c.dim(']')
}
```

- [ ] **Step 3: Use `FOLDERS` in `parseArgs` and the folder picker**

In `parseArgs`, change the `--both` case:

```js
    else if (a === '--both') opts.folders.push(...FOLDERS)
```

In `linkCommand`, change the folder multiselect to derive from `FOLDERS`:

```js
    folders = await prompt.multiselect(
      'Which folder(s) to link into?',
      FOLDERS.map((f) => ({ label: `${f}/skills`, value: f }))
    )
```

- [ ] **Step 4: Rework `statusCommand` with computed columns**

Replace the whole `statusCommand` function body (the matrix-printing part) with:

```js
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
  const COL = 9 // one folder column
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
```

Note: the `'skill'.length` leftover from the old width calc is intentionally dropped (no "skill" header is printed).

- [ ] **Step 5: Update the plan render + result report in `linkCommand`**

In the plan-rendering loop, replace the old `ACTION[...]` lookup with `STATE`:

```js
  for (const p of plans) {
    const cells = p.statuses
      .map((st) => `${st.folder} ${STATE[st.status].actionColor(STATE[st.status].action)}`)
      .join('   ')
    console.log(`  ${c.cyan(p.skill.name.padEnd(width))}  ${cells}`)
  }
```

Delete the old local `ACTION` map inside `linkCommand`. In the result-reporting section, replace the local `icon` map + `made` filter with `OUTCOME`:

```js
  console.log('')
  for (const r of results) {
    let note = ''
    if (r.status === 'exists') note = c.yellow(' (real dir exists, use --force to replace)')
    if (r.status === 'replaced') note = c.dim(` (old folder → ${r.backup})`)
    console.log(`  ${OUTCOME[r.status].icon}  ${r.folder}/skills/${r.skill}${note}`)
  }
  const made = results.filter((r) => OUTCOME[r.status].made).length
  console.log(`\n${c.green(`Done. ${made} symlink(s) created/updated.`)}\n`)
```

Also change the picker legend line and any remaining `MARK`/`ACTION` references to the new helpers (the picker prints `console.log(\`  ${c.dim(LEGEND)}\`)` — unchanged; the picker checkbox pre-check `statuses.some((st) => st.status === 'linked')` — unchanged).

- [ ] **Step 6: Verify tests + visual output**

Run: `npm test`
Expected: all pass (link/cli tests unaffected — behavior identical, only presentation refactored).

Run: `node bin/cdragon.js status --offline | cat`
Expected: matrix prints; `global`/`project` labels sit over their `claude`/`agents` sub-columns; marks align under the sub-labels.

Run: `cd /tmp && node <repo>/bin/cdragon.js -p --claude tdd -y && node <repo>/bin/cdragon.js -p --both tdd -y`
Expected: first links `.claude`; second shows `.claude = already / .agents + link` and links `.agents`. `rm -rf /tmp/.claude /tmp/.agents` after.

- [ ] **Step 7: Commit**

```bash
git add src/link.js bin/cdragon.js
git commit -m "refactor: single STATE/OUTCOME vocab, FOLDERS constant, computed status columns"
```

---

## Task 5: Extract shared selection flow from `linkCommand` (cleanup)

`linkCommand` is ~126 lines mixing scope/folder selection, skill picking, plan rendering, conflict consent, and reporting — over the `<50 lines` guideline and duplicated by the upcoming `unlinkCommand`. Extract the target-selection and reporting concerns into named helpers that both commands reuse. Purely structural: behavior and tests stay green.

**Files:**
- Modify: `bin/cdragon.js` (add `chooseTargets`, `chooseSkills`; slim `linkCommand`)

**Interfaces:**
- Produces:
  - `async chooseTargets(opts) → { scope, folders, base }` — resolves scope (flag or `select` prompt), folders (flags or `multiselect`), and `base` (home vs cwd). Throws `'No target folder selected.'` if empty.
  - `async chooseSkills(opts, skills, base, folders) → skill[]` — the all/named/interactive picker logic (with `statusTag` labels and linked-pre-check), returning chosen skill objects. Throws on unknown named skill.

- [ ] **Step 1: Add the extracted helpers**

Add above `linkCommand` in `bin/cdragon.js`:

```js
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
```

- [ ] **Step 2: Slim `linkCommand` to use them**

Replace the scope/folder/skill-selection preamble of `linkCommand` (everything from the `// 1. Scope` comment through the `chosen = ...` resolution) with:

```js
async function linkCommand(opts) {
  const skillsDir = resolveSkillsDir(opts)
  const skills = discoverSkills(skillsDir)
  if (!skills.length) throw new Error(`No skills found in ${skillsDir}`)

  const { scope, folders, base } = await chooseTargets(opts)
  const chosen = await chooseSkills(opts, skills, base, folders)
  if (!chosen.length) throw new Error('No skills selected.')

  // ...plan / conflict / confirm / link / report (unchanged from Task 4)...
```

Keep the plan/conflict/report body exactly as left by Task 4.

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: all pass (identical behavior).

Run: `node bin/cdragon.js --help` then a manual interactive `node bin/cdragon.js` in a scratch dir (arrow keys) to confirm the picker still renders scope → folders → skills.
Expected: unchanged interactive flow.

- [ ] **Step 4: Commit**

```bash
git add bin/cdragon.js
git commit -m "refactor: extract chooseTargets/chooseSkills from linkCommand"
```

---

## Task 6: `unlink` command (feature)

Add the inverse of `link`: remove skill symlinks. Safety-first — remove ONLY symlinks that currently point into this repo (`linked`); never touch real dirs (`dir`) or foreign/stale links (`stale`).

**Files:**
- Modify: `src/link.js` (add + export `unlinkSkill`, `unlinkSkills`)
- Modify: `bin/cdragon.js` (add `unlinkCommand`, routing, help)
- Modify: `test/link.test.js` (unit tests)

**Interfaces:**
- Consumes: `linkStatus`, `chooseTargets`, `skillStatuses`, `statusTag`.
- Produces:
  - `unlinkSkill(sourceDir, linkPath) → { status: 'unlinked'|'absent'|'not-ours' }` — removes the symlink only when it points at `sourceDir`.
  - `unlinkSkills(skills, base, folder) → [{ skill, folder, status }]`.
  - CLI: `cdragon unlink [skills...]` / `cdragon rm …` with the same scope/folder flags as `link`.

- [ ] **Step 1: Write failing unit tests**

Append to `test/link.test.js` (add `unlinkSkill` to the require at the top: `const { linkSkill, linkStatus, skillStatuses, unlinkSkill } = require('../src/link')`):

```js
test('unlinkSkill: removes our own symlink', () => {
  const linkPath = path.join(target, 'demo')
  linkSkill(source, linkPath)
  assert.deepEqual(unlinkSkill(source, linkPath), { status: 'unlinked' })
  assert.equal(linkStatus(source, linkPath), 'none')
})

test('unlinkSkill: leaves a real dir untouched (not-ours)', () => {
  const linkPath = path.join(target, 'demo')
  fs.mkdirSync(linkPath)
  fs.writeFileSync(path.join(linkPath, 'keep.txt'), 'mine')
  assert.deepEqual(unlinkSkill(source, linkPath), { status: 'not-ours' })
  assert.ok(fs.existsSync(path.join(linkPath, 'keep.txt')))
})

test('unlinkSkill: leaves a foreign symlink untouched (not-ours)', () => {
  const linkPath = path.join(target, 'demo')
  fs.symlinkSync(path.join(tmp, 'elsewhere'), linkPath, 'dir')
  assert.deepEqual(unlinkSkill(source, linkPath), { status: 'not-ours' })
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink())
})

test('unlinkSkill: absent when nothing there', () => {
  assert.deepEqual(unlinkSkill(source, path.join(target, 'demo')), { status: 'absent' })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: 4 new tests fail with "unlinkSkill is not a function".

- [ ] **Step 3: Implement in `src/link.js`**

Add before the `module.exports` line:

```js
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
```

Update exports:

```js
module.exports = {
  linkSkill, linkSkills, linkStatus, skillStatuses, FOLDERS, unlinkSkill, unlinkSkills,
}
```

- [ ] **Step 4: Run — expect all green**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Add `unlinkCommand` + routing + help in `bin/cdragon.js`**

Update the link import to include the unlink functions:

```js
const { linkSkills, skillStatuses, FOLDERS, unlinkSkills } = require('../src/link')
```

Add `unlinkCommand` after `linkCommand`:

```js
async function unlinkCommand(opts) {
  const skillsDir = resolveSkillsDir(opts)
  const skills = discoverSkills(skillsDir)
  if (!skills.length) throw new Error(`No skills found in ${skillsDir}`)

  const { scope, folders, base } = await chooseTargets(opts)

  // Only consider skills actually linked in the chosen targets.
  let chosen
  if (opts.all) {
    chosen = skills.filter((s) => skillStatuses(s, base, folders).some((st) => st.status === 'linked'))
  } else if (opts.skills.length) {
    chosen = opts.skills.map((name) => {
      const found = skills.find((s) => s.name === name)
      if (!found) throw new Error(`Unknown skill: ${name}`)
      return found
    })
  } else {
    const choices = []
    for (const s of skills) {
      const statuses = skillStatuses(s, base, folders)
      if (!statuses.some((st) => st.status === 'linked')) continue
      choices.push({ value: s.name, checked: false, label: `${s.name}  ${statusTag(statuses)}` })
    }
    if (!choices.length) {
      console.log(c.dim('Nothing linked in the selected targets.'))
      return
    }
    const picked = await prompt.multiselect('Which skills to unlink?', choices)
    chosen = picked.map((name) => skills.find((s) => s.name === name))
  }
  if (!chosen.length) {
    console.log(c.dim('Nothing selected.'))
    return
  }

  console.log('')
  console.log(`  ${c.bold('scope')}    ${scope} ${c.dim(`(${base})`)}`)
  console.log(`  ${c.bold('folders')}  ${folders.join(', ')}\n`)

  if (!opts.yes) {
    const ok = await prompt.confirm(`Remove ${chosen.length} skill link(s) from ${folders.join(', ')}?`, false)
    if (!ok) {
      console.log(c.dim('Aborted.'))
      return
    }
  }

  const results = []
  for (const folder of folders) results.push(...unlinkSkills(chosen, base, folder))

  const icon = {
    unlinked: c.green('- unlinked'),
    absent: c.dim('= absent  '),
    'not-ours': c.yellow('! kept    '),
  }
  console.log('')
  for (const r of results) {
    const note = r.status === 'not-ours' ? c.yellow(' (not our symlink — left as-is)') : ''
    console.log(`  ${icon[r.status]}  ${r.folder}/skills/${r.skill}${note}`)
  }
  const removed = results.filter((r) => r.status === 'unlinked').length
  console.log(`\n${c.green(`Done. ${removed} link(s) removed.`)}\n`)
}
```

Add routing in `main()` (after the `status` line):

```js
  if (cmd === 'unlink' || cmd === 'rm') {
    return unlinkCommand({ ...parseArgs(argv.slice(1)), ...syncOpts })
  }
```

Add to the `help()` Usage block:

```js
  cdragon unlink [skills...]  Remove skill symlinks (only ones pointing at this repo)
```

- [ ] **Step 6: Add a CLI test for unlink**

Append to `test/cli.test.js`:

```js
test('unlink -y removes our link but keeps a real folder', () => {
  // our link
  run(['-p', '--claude', 'tdd', '-y'])
  const link = path.join(tmp, '.claude', 'skills', 'tdd')
  assert.ok(fs.lstatSync(link).isSymbolicLink())
  // a real folder for a different skill name
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
```

- [ ] **Step 7: Run — expect all green**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/link.js bin/cdragon.js test/link.test.js test/cli.test.js
git commit -m "feat: add unlink command (removes only our own symlinks)"
```

---

## Task 7: `findOrphans` — detect stale leftover links (feature, TDD)

When a skill is removed or renamed in the repo, its symlink lingers broken in target dirs and is invisible to `status` (which only iterates current repo skills). Add detection.

**Files:**
- Modify: `src/link.js` (add + export `findOrphans`)
- Modify: `test/link.test.js`

**Interfaces:**
- Produces: `findOrphans(base, folders, sourceRoot) → [{ folder, name, linkPath, target }]` — symlinks under `<base>/<folder>/skills` that point INTO `sourceRoot` but whose target no longer exists. Foreign symlinks (pointing outside `sourceRoot`) and real dirs are never returned.

- [ ] **Step 1: Write failing tests**

Append to `test/link.test.js` (add `findOrphans` to the require):

```js
test('findOrphans: dangling link into source is reported', () => {
  const base = path.join(tmp, 'target')
  const root = path.join(base, '.claude', 'skills')
  fs.mkdirSync(root, { recursive: true })
  const sourceRoot = path.join(tmp, 'repo', 'skills')
  fs.symlinkSync(path.join(sourceRoot, 'gone'), path.join(root, 'gone'), 'dir')
  const orphans = findOrphans(base, ['.claude'], sourceRoot)
  assert.equal(orphans.length, 1)
  assert.equal(orphans[0].name, 'gone')
})

test('findOrphans: valid link and foreign broken link are NOT reported', () => {
  const base = path.join(tmp, 'target')
  const root = path.join(base, '.claude', 'skills')
  fs.mkdirSync(root, { recursive: true })
  const sourceRoot = path.join(tmp, 'repo', 'skills')
  fs.mkdirSync(path.join(sourceRoot, 'demo2'), { recursive: true })
  fs.symlinkSync(path.join(sourceRoot, 'demo2'), path.join(root, 'demo2'), 'dir') // valid
  fs.symlinkSync('/nope/foreign', path.join(root, 'foreign'), 'dir')              // foreign+broken
  const orphans = findOrphans(base, ['.claude'], sourceRoot)
  assert.deepEqual(orphans.map((o) => o.name), [])
})

test('findOrphans: missing target dir yields empty (no throw)', () => {
  assert.deepEqual(findOrphans(path.join(tmp, 'nope'), ['.claude'], tmp), [])
})
```

- [ ] **Step 2: Run — expect FAIL** (`findOrphans is not a function`)

Run: `npm test`

- [ ] **Step 3: Implement in `src/link.js`**

Add before `module.exports`:

```js
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
```

Update exports to add `findOrphans`.

- [ ] **Step 4: Run — expect all green**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add src/link.js test/link.test.js
git commit -m "feat: add findOrphans to detect stale leftover skill links"
```

---

## Task 8: Surface orphans in `status` + `prune` command (feature)

Show orphaned links at the bottom of `cdragon status`, and add `cdragon prune` to remove them (with confirmation).

**Files:**
- Modify: `bin/cdragon.js` (add `fs` import, `findOrphans` import, orphan section in `statusCommand`, `pruneCommand`, routing, help)
- Modify: `test/cli.test.js`

**Interfaces:**
- Consumes: `findOrphans(base, folders, sourceRoot)`; `resolveSkillsDir` (the resolved skills dir IS `sourceRoot`).
- Produces: `cdragon prune [-g|-p] [-y]` removing orphaned links across the chosen scope(s).

- [ ] **Step 1: Add imports**

At the top of `bin/cdragon.js`:

```js
const fs = require('node:fs')
```

Extend the link import:

```js
const { linkSkills, skillStatuses, FOLDERS, unlinkSkills, findOrphans } = require('../src/link')
```

- [ ] **Step 2: Append an orphan section to `statusCommand`**

Just before the final `console.log(\`\n  ${LEGEND}\n\`)` in `statusCommand`, insert:

```js
  const orphans = targets.flatMap((t) =>
    findOrphans(t.base, FOLDERS, skillsDir).map((o) => ({ ...o, scope: t.label }))
  )
  if (orphans.length) {
    console.log(`\n  ${c.yellow(`Orphaned links (${orphans.length})`)} ${c.dim('— source gone; run `cdragon prune`')}`)
    for (const o of orphans) {
      console.log(`    ${c.yellow('⚠')} ${o.scope} ${o.folder}/skills/${o.name}`)
    }
  }
```

- [ ] **Step 3: Add `pruneCommand` + routing + help**

Add `pruneCommand`:

```js
async function pruneCommand(opts) {
  const skillsDir = resolveSkillsDir(opts)
  const targets =
    opts.scope === 'global'
      ? [{ label: 'global', base: os.homedir() }]
      : opts.scope === 'project'
        ? [{ label: 'project', base: process.cwd() }]
        : [
            { label: 'global', base: os.homedir() },
            { label: 'project', base: process.cwd() },
          ]

  const orphans = targets.flatMap((t) =>
    findOrphans(t.base, FOLDERS, skillsDir).map((o) => ({ ...o, scope: t.label }))
  )
  if (!orphans.length) {
    console.log(c.green('No orphaned links. Nothing to prune.'))
    return
  }

  console.log(`\n  ${c.bold('Orphaned links')} ${c.dim('(source skill missing from the repo)')}\n`)
  for (const o of orphans) {
    console.log(`    ${c.yellow('⚠')} ${o.scope} ${o.folder}/skills/${o.name}`)
  }
  console.log('')

  if (!opts.yes) {
    const ok = await prompt.confirm(`Remove ${orphans.length} orphaned link(s)?`, false)
    if (!ok) {
      console.log(c.dim('Aborted.'))
      return
    }
  }
  for (const o of orphans) fs.rmSync(o.linkPath)
  console.log(`\n${c.green(`Done. ${orphans.length} orphaned link(s) removed.`)}\n`)
}
```

Routing in `main()` (after the `unlink` block):

```js
  if (cmd === 'prune') {
    return pruneCommand({ ...parseArgs(argv.slice(1)), ...syncOpts })
  }
```

Help Usage additions:

```js
  cdragon prune              Remove orphaned links (skills deleted/renamed in the repo)
```

- [ ] **Step 4: Add a CLI test for prune**

Append to `test/cli.test.js`:

```js
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
```

- [ ] **Step 5: Run — expect all green**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Manual smoke test**

Run:
```bash
cd /tmp && rm -rf .claude
node <repo>/bin/cdragon.js -p --claude tdd -y
ln -s <repo>/skills/renamed-away /tmp/.claude/skills/renamed-away   # simulate an orphan
node <repo>/bin/cdragon.js status --offline | cat                    # shows "Orphaned links (1)"
node <repo>/bin/cdragon.js prune -p -y                               # removes it
rm -rf /tmp/.claude
```
Expected: status lists the orphan; prune removes only it.

- [ ] **Step 7: Commit**

```bash
git add bin/cdragon.js test/cli.test.js
git commit -m "feat: surface orphaned links in status and add prune command"
```

---

## Task 9: Docs + release (0.4.0)

Document the new commands/flags and publish so npx/npm users get `status`, `--force`, `unlink`, `prune`, and the correctness fixes (they currently receive 0.3.0, which predates all of it).

**Files:**
- Modify: `README.md`
- Modify: `package.json` (version, via `npm version`)

**Interfaces:** none (release step).

- [ ] **Step 1: Update `README.md` command list + flag table**

In the `### 사용` section's command block, add (the `status` line was added earlier; add unlink/prune):

```bash
cdragon unlink [skills...]  # 스킬 심링크 제거 (이 레포를 가리키는 것만)
cdragon prune               # 레포에서 사라진 스킬의 고아 링크 정리
```

In the flag table, confirm `-f, --force` row exists (added earlier). Add a one-line note under the table:

```markdown
`unlink`은 이 레포를 가리키는 심링크만 지웁니다 — 실제 폴더나 다른 곳을 가리키는 링크는 건드리지 않습니다. `prune`은 레포에서 삭제·개명된 스킬의 깨진 링크만 정리합니다. `cdragon status`는 그런 고아 링크를 하단에 표시합니다.
```

Add a note documenting the reserved-word escape hatch (since `unlink`/`prune`/`status` join `list`/`help`/`link` as reserved subcommands):

```markdown
> 스킬 이름이 `status`·`unlink`·`prune`·`list`·`help`·`link`·`rm` 등 예약어와 겹치면 `cdragon link <이름>`으로 명시적으로 링크하세요.
```

- [ ] **Step 2: Full test run + clean working tree check**

Run: `npm test`
Expected: all pass.

Run: `git status --short`
Expected: only intended files modified. **Do NOT `git add -A`** — the working tree contains unrelated untracked files (`*.html` saju outputs, other skill dirs). Stage explicitly.

- [ ] **Step 3: Commit docs + staged source**

```bash
git add README.md
git commit -m "docs: document status, unlink, prune, and --force"
```

- [ ] **Step 4: Bump version (creates commit + tag)**

Run: `npm version minor`
Expected: `v0.4.0`; `package.json` updated, a `chore`-style version commit and a `v0.4.0` git tag created automatically.

- [ ] **Step 5: Push (review gate) + publish (OTP)**

> These two steps involve user-in-the-loop gates: the global git hook opens Zed for review before push, and `npm publish` prompts for an OTP. Run them interactively.

```bash
git push --follow-tags
npm publish --access public
```

- [ ] **Step 6: Verify the published package**

Run: `npm view cdragon version`
Expected: `0.4.0`.

Run (in a scratch dir): `npx cdragon@latest status --offline | cat`
Expected: the matrix renders — confirming external users now get the new build.

---

## Self-Review

**1. Spec coverage** (the four selected buckets):
- **정합성 수정 + 테스트** → Tasks 1 (harness), 2 (linkStatus errors + readlink race), 3 (confirm TTY). ✅
- **라이프사이클 명령** → Tasks 6 (unlink), 7–8 (findOrphans, status orphans, prune). ✅
- **코드 정리(리팩터)** → Tasks 4 (STATE/OUTCOME consolidation, FOLDERS constant, status alignment, `'skill'.length` removed), 5 (linkCommand extraction). ✅
- **npm 배포** → Task 9. ✅
- Review findings mapped: lstat swallow + readlink race (T2), confirm TTY (T3), three-maps duplication + `made` (T4), hardcoded folders (T4), status alignment fragility (T4), `'skill'.length` leftover (T4), linkCommand length (T5). The `status`/`st` reserved-word footgun (marginal, no colliding skill) is handled by documentation in T9 rather than code, since guarding it would add complexity for a non-existent collision.
- Deliberately deferred: the unused-`linkStatus`-export finding dissolves — it is now imported by `test/link.test.js`, so the export is justified.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step contains full code; every test step shows the assertions; every run step states the expected result.

**3. Type consistency:** `linkStatus` returns `'none'|'linked'|'stale'|'dir'` (T2), consumed by `STATE` keys (T4), `skillStatuses` (unchanged), `unlinkSkill` (T6), `findOrphans` (T7). `linkSkill`/`linkSkills` return `{status, backup?}` with `status ∈ OUTCOME` keys (T4). `unlinkSkill` returns `{status: 'unlinked'|'absent'|'not-ours'}` — matched by the `icon` map in `unlinkCommand` (T6). `findOrphans` returns `{folder, name, linkPath, target}` — `linkPath` consumed by `pruneCommand`'s `fs.rmSync` (T8). `chooseTargets`→`{scope, folders, base}` and `chooseSkills`→`skill[]` consumed by both `linkCommand` (T5) and `unlinkCommand` (T6). Consistent.
