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

// Single-choice radio list. Resolves the chosen option's `value`.
function select(message, choices) {
  requireTTY()
  return new Promise((resolve) => {
    let index = 0
    const totalLines = choices.length + 1
    let drawn = false

    const draw = () => {
      let out = drawn ? `\x1b[${totalLines}A` : ''
      out += `\x1b[2K${c.cyan('?')} ${c.bold(message)}\n`
      choices.forEach((choice, i) => {
        const active = i === index
        const pointer = active ? c.cyan('❯') : ' '
        out += `\x1b[2K${pointer} ${active ? c.cyan(choice.label) : choice.label}\n`
      })
      process.stdout.write(out)
      drawn = true
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
    draw()
  })
}

// Multi-choice checkbox list. Resolves an array of selected `value`s.
function multiselect(message, choices) {
  requireTTY()
  return new Promise((resolve) => {
    let index = 0
    const selected = new Set()
    const totalLines = choices.length + 1
    let drawn = false

    const draw = () => {
      let out = drawn ? `\x1b[${totalLines}A` : ''
      const hint = c.dim('(↑↓ move · space toggle · a all · enter confirm)')
      out += `\x1b[2K${c.cyan('?')} ${c.bold(message)} ${hint}\n`
      choices.forEach((choice, i) => {
        const active = i === index
        const box = selected.has(i) ? c.green('◉') : '◯'
        const pointer = active ? c.cyan('❯') : ' '
        out += `\x1b[2K${pointer} ${box} ${active ? c.cyan(choice.label) : choice.label}\n`
      })
      process.stdout.write(out)
      drawn = true
    }

    const onKey = (str, key) => {
      if (!key) return
      if (key.name === 'up' || key.name === 'k') {
        index = (index - 1 + choices.length) % choices.length
        draw()
      } else if (key.name === 'down' || key.name === 'j') {
        index = (index + 1) % choices.length
        draw()
      } else if (key.name === 'space' || str === ' ') {
        selected.has(index) ? selected.delete(index) : selected.add(index)
        draw()
      } else if (key.name === 'a') {
        if (selected.size === choices.length) selected.clear()
        else choices.forEach((_, i) => selected.add(i))
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
    draw()
  })
}

// Yes/no question. Resolves a boolean.
function confirm(message, defaultYes = true) {
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
