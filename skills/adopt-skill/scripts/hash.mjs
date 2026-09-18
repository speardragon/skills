#!/usr/bin/env node
// skills-lock.json 의 computedHash 를 계산한다.
//
//   node hash.mjs <skill-dir>
//
// vercel `skills` CLI(v1.5.x)의 computeSkillFolderHash 와 동일한 알고리즘:
// 폴더 안 모든 파일을 상대경로 기준으로 정렬한 뒤, 경로와 내용을 차례로
// sha256 에 먹인다. .git / node_modules 만 제외한다.
//
// 즉 .DS_Store 같은 군더더기 파일 하나만 있어도 해시가 달라진다. 반드시
// 스킬 폴더를 최종 상태로 만든 다음(불필요 파일 제거 후) 마지막에 계산할 것.

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

async function collect(baseDir, currentDir, results) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') return
        await collect(baseDir, fullPath, results)
      } else if (entry.isFile()) {
        results.push({
          relativePath: relative(baseDir, fullPath).split('\\').join('/'),
          content: await readFile(fullPath),
        })
      }
    })
  )
}

export async function computeSkillFolderHash(skillDir) {
  const files = []
  await collect(skillDir, skillDir, files)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.relativePath)
    hash.update(file.content)
  }
  return hash.digest('hex')
}

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node hash.mjs <skill-dir>')
  process.exit(1)
}

try {
  console.log(await computeSkillFolderHash(dir))
} catch (error) {
  console.error(`해시 계산 실패: ${error.message}`)
  process.exit(1)
}
