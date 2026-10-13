# Shared Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 현재 Claude 전역 지시를 원본 하나로 보존하고 Claude, Codex, Antigravity, Grok Build에 공유한다.

**Architecture:** instructions/AGENTS.md를 원본으로 사용한다. 전역 지시 파일용 별도 모듈과 CLI 명령을 추가하고 기존 파일 및 외부 링크는 강제 교체 시 백업한다. Grok은 Claude의 동일 원본이 연결되어 있으면 그 경로를 사용한다.

**Tech Stack:** Node.js 18+, CommonJS, node:test.

## Global Constraints

- ~/.claude/CLAUDE.md의 내용 그대로 보존.
- 기존 스킬 연결 동작 유지.
- 기존 파일 및 외부 심링크는 백업 없이 교체하지 않음.
- 사용자가 이미 실행을 요청했으므로 이 세션에서 구현 및 적용.

---

### Task 1: 원본 및 전역 연결 기능

**Files:** instructions/AGENTS.md, src/instructions.js, bin/cdragon.js, src/source.js, package.json, test/instructions.test.js, README.md.

- [x] 원본을 `cp ~/.claude/CLAUDE.md instructions/AGENTS.md`로 가져온다.
- [x] `cdragon instructions link/status/unlink --global --claude/--codex/--gemini/--grok/--all-targets --force -y --source PATH`를 제공한다.
- [x] 전역 경로는 `.claude/CLAUDE.md`, `.codex/AGENTS.md`, `.gemini/GEMINI.md`, `.grok/AGENTS.md`로 매핑한다.
- [x] 교체 전 같은 도구 폴더의 `instructions-backup/`에 기존 파일 또는 링크를 이동한다. unlink는 해당 원본을 가리키는 링크만 제거한다.
- [x] Grok 연결 시 Claude 전역 파일의 동일 원본 연결을 확인하고 중복 연결을 생략한다. Codex override가 있으면 경고한다.
- [x] 미러에서 원본을 찾되 없으면 번들 원본을 사용한다. npm files에 instructions를 포함한다.
- [x] `node --test`로 백업 보존, 반복 실행, 외부 링크 보호, unlink, Grok 상속 동작을 검증한다.
- [x] 전역 연결 적용 후 원본 일치 및 `grok inspect --json`에서 지시 파일 로딩을 확인한다.
