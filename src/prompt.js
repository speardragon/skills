'use strict'

// Zero-dependency interactive prompts built on the built-in readline keypress
// stream. Three primitives: select (radio), multiselect (checkbox), confirm.

const readline = require('node:readline')
const c = require('./colors')

function requireTTY() {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt needs a TTY. Pass flags instead — see `cdragon --help`.')
  }
}

function setup() {
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
}

function teardown(onKey) {
  process.stdin.removeListener('keypress', onKey)
  process.stdin.setRawMode(false)
  process.stdin.pause()
}

// How many item rows a scrollable list may draw. Fixed for the life of one
// prompt call — the redraw trick below moves the cursor up by exactly this
// many lines each time, so the drawn height must never change or the
// terminal scrolls and the cursor math desyncs (the bug this fixes).
function visibleRows(total) {
  const termRows = process.stdout.rows || 24
  const budget = Math.max(3, termRows - 2) // leave room for the message line + shell prompt
  return Math.min(total, budget)
}

// Slide the [start, start+size) window just enough to keep `active` in view,
// plus one row of context (scrolloff) so the window starts moving before the
// cursor pins itself to the very edge.
function scrollWindow(active, total, size, prevStart) {
  const margin = size >= 5 ? 1 : 0
  let start = prevStart
  if (active - margin < start) start = active - margin
  if (active + margin >= start + size) start = active + margin - size + 1
  return Math.max(0, Math.min(start, Math.max(0, total - size)))
}

// Visible width of one code point. Hangul and CJK render two columns wide;
// everything else in our labels is one column.
function charWidth(cp) {
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals … Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat forms
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) {
    return 2
  }
  return 1
}

const ANSI_RE = /^\x1b\[[0-9;]*m/

// Every drawn line must occupy exactly one terminal row: the redraw trick
// moves the cursor up by the number of lines *written*, so a single label
// soft-wrapping to two rows desyncs the cursor math the moment it scrolls
// into view. Clamp a line (which may contain ANSI color codes — they pass
// through at zero width) to `max` visible columns; if content is cut, append
// an ellipsis and a color reset so a severed color run can't bleed onward.
function fitToWidth(line, max) {
  let out = ''
  let width = 0
  let i = 0
  while (i < line.length) {
    if (line[i] === '\x1b') {
      const esc = ANSI_RE.exec(line.slice(i))
      if (esc) {
        out += esc[0]
        i += esc[0].length
        continue
      }
    }
    const cp = line.codePointAt(i)
    const ch = String.fromCodePoint(cp)
    const w = charWidth(cp)
    if (width + w > max - 1) {
      // Something visible would overflow — cut here unless this is the very
      // last visible char and it fits exactly in the final column.
      const rest = line.slice(i + ch.length).replace(/\x1b\[[0-9;]*m/g, '')
      if (width + w <= max && rest.length === 0) return out + ch
      return out + '…\x1b[0m'
    }
    out += ch
    width += w
    i += ch.length
  }
  return out
}

// Push the cursor down `n` blank lines before the first draw of a scrollable
// prompt. Whatever was printed just above (earlier prompts, log lines) may
// leave the cursor with less than a full screen of room below it — if the
// first draw is taller than that, the terminal scrolls to fit it, but that
// draw doesn't yet know to compensate by moving up first (nothing has been
// drawn to move up from). Reserving the space first means: if a scroll is
// needed, it happens now, against blank lines, and the reserved block ends
// up fully on-screen with the cursor sitting right after it — ready for the
// normal "move up N lines" redraw to find the block exactly where it left it.
function reserve(n) {
  process.stdout.write('\n'.repeat(n))
}

// Single-choice radio list. Resolves the chosen option's `value`.
function select(message, choices) {
  requireTTY()
  return new Promise((resolve) => {
    let index = 0
    const size = visibleRows(choices.length)
    const totalLines = size + 1
    let scrollTop = 0

    const draw = () => {
      scrollTop = scrollWindow(index, choices.length, size, scrollTop)
      const cols = process.stdout.columns || 80
      const scrolled = size < choices.length
      const pos = scrolled ? c.dim(` (${scrollTop + 1}-${scrollTop + size} of ${choices.length} — ↑↓ scroll)`) : ''
      let out = `\x1b[${totalLines}A`
      out += `\x1b[2K${fitToWidth(`${c.cyan('?')} ${c.bold(message)}${pos}`, cols)}\n`
      for (let row = 0; row < size; row++) {
        const i = scrollTop + row
        const choice = choices[i]
        const active = i === index
        const pointer = active ? c.cyan('❯') : ' '
        out += `\x1b[2K${fitToWidth(`${pointer} ${active ? c.cyan(choice.label) : choice.label}`, cols)}\n`
      }
      out += '\x1b[J' // wipe anything stale below the block
      process.stdout.write(out)
    }

    const onKey = (_str, key) => {
      if (!key) return
      if (key.name === 'up' || key.name === 'k') {
        index = (index - 1 + choices.length) % choices.length
        draw()
      } else if (key.name === 'down' || key.name === 'j') {
        index = (index + 1) % choices.length
        draw()
      } else if (key.name === 'return') {
        teardown(onKey)
        resolve(choices[index].value)
      } else if (key.ctrl && key.name === 'c') {
        teardown(onKey)
        process.exit(130)
      }
    }

    setup()
    process.stdin.on('keypress', onKey)
    reserve(totalLines)
    draw()
  })
}

// Multi-choice checkbox list. Resolves an array of selected `value`s.
// A choice with `{ header: true }` renders as a non-selectable group label
// and is skipped during navigation.
function multiselect(message, choices) {
  requireTTY()
  return new Promise((resolve) => {
    const selectable = choices.map((c, i) => (c.header ? -1 : i)).filter((i) => i >= 0)
    // Pre-check any choice flagged `checked` (e.g. already installed).
    const selected = new Set(selectable.filter((i) => choices[i].checked))
    const size = visibleRows(choices.length)
    const totalLines = size + 1
    let scrollTop = 0
    let pos = 0 // index into `selectable`

    const cursor = () => selectable[pos]

    const draw = () => {
      scrollTop = scrollWindow(cursor(), choices.length, size, scrollTop)
      const cols = process.stdout.columns || 80
      const scrolled = size < choices.length
      const posHint = scrolled ? c.dim(` (${scrollTop + 1}-${scrollTop + size} of ${choices.length})`) : ''
      let out = `\x1b[${totalLines}A`
      const hint = c.dim('(↑↓ move · space toggle · a all · enter confirm)')
      out += `\x1b[2K${fitToWidth(`${c.cyan('?')} ${c.bold(message)} ${hint}${posHint}`, cols)}\n`
      for (let row = 0; row < size; row++) {
        const i = scrollTop + row
        const choice = choices[i]
        if (choice.header) {
          out += `\x1b[2K${fitToWidth(`  ${c.bold(choice.label)}`, cols)}\n`
          continue
        }
        const active = i === cursor()
        const box = selected.has(i) ? c.green('◉') : '◯'
        const pointer = active ? c.cyan('❯') : ' '
        out += `\x1b[2K${fitToWidth(`  ${pointer} ${box} ${active ? c.cyan(choice.label) : choice.label}`, cols)}\n`
      }
      out += '\x1b[J' // wipe anything stale below the block
      process.stdout.write(out)
    }

    const onKey = (str, key) => {
      if (!key) return
      if (key.name === 'up' || key.name === 'k') {
        pos = (pos - 1 + selectable.length) % selectable.length
        draw()
      } else if (key.name === 'down' || key.name === 'j') {
        pos = (pos + 1) % selectable.length
        draw()
      } else if (key.name === 'space' || str === ' ') {
        const i = cursor()
        selected.has(i) ? selected.delete(i) : selected.add(i)
        draw()
      } else if (key.name === 'a') {
        if (selected.size === selectable.length) selected.clear()
        else selectable.forEach((i) => selected.add(i))
        draw()
      } else if (key.name === 'return') {
        teardown(onKey)
        resolve([...selected].sort((a, b) => a - b).map((i) => choices[i].value))
      } else if (key.ctrl && key.name === 'c') {
        teardown(onKey)
        process.exit(130)
      }
    }

    setup()
    process.stdin.on('keypress', onKey)
    reserve(totalLines)
    draw()
  })
}

// Yes/no question. Resolves a boolean.
function confirm(message, defaultYes = true) {
  requireTTY()
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const hint = defaultYes ? 'Y/n' : 'y/N'
  return new Promise((resolve) => {
    rl.question(`${c.cyan('?')} ${c.bold(message)} ${c.dim(`(${hint})`)} `, (answer) => {
      rl.close()
      const a = answer.trim().toLowerCase()
      if (a === '') return resolve(defaultYes)
      resolve(a === 'y' || a === 'yes')
    })
  })
}

module.exports = { select, multiselect, confirm }
