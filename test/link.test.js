'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { linkSkill, linkStatus, skillStatuses, unlinkSkill, findOrphans } = require('../src/link')

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

test('linkStatus: rethrows non-ENOENT errors instead of reporting none', () => {
  // A regular file where a directory is expected -> lstat of a child throws ENOTDIR.
  const notADir = path.join(tmp, 'afile')
  fs.writeFileSync(notADir, 'x')
  const linkPath = path.join(notADir, 'skills', 'demo')
  assert.throws(() => linkStatus(source, linkPath), (err) => err.code === 'ENOTDIR')
})

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
