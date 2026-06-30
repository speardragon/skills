'use strict'

// Minimal ANSI helpers. Colors auto-disable when output is piped or NO_COLOR is set.
const enabled = process.stdout.isTTY && !process.env.NO_COLOR

const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s))

module.exports = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  cyan: wrap(36),
}
