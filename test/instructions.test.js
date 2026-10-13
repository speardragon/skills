'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { TARGETS, linkInstruction, instructionStatus } = require('../src/instructions')
const { unlinkSkill } = require('../src/link')

let base, source
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cdragon-instructions-test-'))
  source = path.join(base, 'shared.md')
  fs.writeFileSync(source, 'Shared instructions\n')
})
afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

test('link is idempotent and changes to the original propagate', () => {
  assert.equal(linkInstruction(source, base, 'codex').status, 'linked')
  assert.equal(linkInstruction(source, base, 'codex').status, 'already')
  fs.writeFileSync(source, 'Updated instructions\n')
  assert.equal(fs.readFileSync(path.join(base, TARGETS.codex), 'utf8'), 'Updated instructions\n')
})

test('existing file is protected and force preserves its content in a backup', () => {
  const target = path.join(base, TARGETS.claude)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, 'Original instructions')
  assert.equal(linkInstruction(source, base, 'claude').status, 'exists')
  assert.equal(fs.readFileSync(target, 'utf8'), 'Original instructions')
  const result = linkInstruction(source, base, 'claude', { force: true })
  assert.equal(fs.readFileSync(result.backup, 'utf8'), 'Original instructions')
  assert.equal(fs.readlinkSync(target), source)
})

test('foreign and dangling symlinks are preserved including backup collisions', () => {
  const target = path.join(base, TARGETS.gemini)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.symlinkSync('missing-original', target)
  assert.equal(linkInstruction(source, base, 'gemini').status, 'exists')
  const first = linkInstruction(source, base, 'gemini', { force: true })
  assert.equal(fs.readlinkSync(first.backup), 'missing-original')
  fs.unlinkSync(target)
  fs.writeFileSync(target, 'Second original')
  const second = linkInstruction(source, base, 'gemini', { force: true })
  assert.notEqual(first.backup, second.backup)
  assert.equal(fs.readlinkSync(first.backup), 'missing-original')
  assert.equal(fs.readFileSync(second.backup, 'utf8'), 'Second original')
})

test('Grok inherits the common Claude instructions without creating a duplicate', () => {
  linkInstruction(source, base, 'claude')
  assert.equal(linkInstruction(source, base, 'grok').status, 'inherited')
  assert.equal(instructionStatus(source, base, 'grok').status, 'inherited')
  assert.equal(fs.existsSync(path.join(base, TARGETS.grok)), false)
})

test('Grok can link independently when Claude is not using the source', () => {
  assert.equal(linkInstruction(source, base, 'grok').status, 'linked')
  assert.equal(instructionStatus(source, base, 'grok').status, 'linked')
})

test('unlink removes only owned links and keeps existing files and foreign links', () => {
  const target = path.join(base, TARGETS.codex)
  linkInstruction(source, base, 'codex')
  assert.equal(unlinkSkill(source, target).status, 'unlinked')
  fs.symlinkSync('foreign.md', target)
  assert.equal(unlinkSkill(source, target).status, 'not-ours')
  fs.unlinkSync(target)
  fs.writeFileSync(target, 'Keep me')
  assert.equal(unlinkSkill(source, target).status, 'not-ours')
})

test('empty or missing source cannot replace existing instructions', () => {
  const target = path.join(base, TARGETS.codex)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, 'Keep me')
  fs.writeFileSync(source, '')
  assert.throws(() => linkInstruction(source, base, 'codex', { force: true }), /non-empty/)
  fs.unlinkSync(source)
  assert.throws(() => linkInstruction(source, base, 'codex', { force: true }), /ENOENT/)
  assert.equal(fs.readFileSync(target, 'utf8'), 'Keep me')
})
