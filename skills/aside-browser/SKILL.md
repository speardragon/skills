---
name: aside-browser
version: 3
description: Read when you need a browser, or have to work across user's logged-in websites (e.g. Gmail, Slack, cloud consoles, etc.), or have to refer personal contexts like memory and browsing history.
---

# Aside

Aside is an AI browser. Inside Aside, there is an intelligent agent designed to handle complex tasks across user's credentials, cookies, browsing history, and various websites the user uses.

> **편입 메모.** 업스트림 `SKILL.md`는 `aside guide`를 실행해 지시문을 런타임에 받아오는 진입점 스텁이다.
> 이 레포에서는 그 출력(Aside CLI `1.26.1010.1739`, Skill version 3)을 보안 감사 후 **여기에 고정**했다.
> `aside guide` 출력이 바뀌면 재감사 후 이 파일과 `references/repl.md`를 갱신한다.
> `aside` CLI가 없으면 **사용자에게 허락을 받은 뒤** 공식 설치 안내(https://aside.com)를 따른다. 임의로 설치 스크립트를 실행하지 않는다.

There are two ways of controlling Aside browser:
- `aside exec` delegates the task to Aside agent. Recommended for most tasks- think of it like spawning subagent.
- `aside repl` starts JS REPL session that provides Playwright-compatible. ONLY USE IT when you need to inspect screenshot and DOM directly.

`aside --help` and `aside <command> --help` print current flags and examples.

## Browser usage

### A. Using `aside exec` (Recommended)

It starts a task in a separate session by Aside agent. Use this for most tasks- it's more context efficient and has a lot of skills and memories about user's context.
After spawning the task, watch the run and give the user a status update around every 60 seconds.

```bash
aside "Send reply to Jack in Slack #develop channel: <text>"
aside -m openai/gpt-5.6-sol -s fast --effort high "Create a project in Vercel and return the project URL"
aside --account u1 "Check unread Slack notifications"
aside --permission full-access "Install the CLI from the project README"
aside "https://example.com" # a link starts with http(s) opens website in user's browser screen
```

#### Resuming the task

When you ask follow-up requests or steer / stop the task during the run, use the following commands:

```bash
aside session resume <id>
aside session resume <id> "Continue the search"
aside session steer <id> "Switch to Google Flights"
aside session queue <id> "Export the final list to CSV"
aside session stop <id>
aside session archive <id>
aside session delete <id>
```

`steer` redirects a running turn. `queue` schedules instructions after the current step. Both commands print `ok` and exit.
`aside session list` includes sessions that were not saved to the chat list.

#### Persistence

Sessions stay off the chat list by default. `aside settings save-sessions true` keeps them there.
`aside settings set-default-profile u1` makes later CLI commands use that profile. One-shot override: `--account u1`.

### B. Use `aside repl`

Use this when you need to directly control tabs, inspect screenshot and DOM, and run JavaScript code on the browser.

**Before using `aside repl`, read [references/repl.md](references/repl.md)** (고정본 of `aside guide repl`).

## Memory

Aside has an accurate memory system for user, which distills user's context into plain-Markdown files who they are, people, projects, sites, preferences).
When you need a user's personal context, always query it before asking the user about prior context, with `aside memory` command:

```bash
aside memory search "<query>" --json
aside memory list --json
aside memory show MEMORY.md
aside memory path
```

Never edit memory files yourself. If the user wants Aside to remember something, run it through `aside exec`.
On `aside mcp`, prefer the `memory_search` tool instead of CLI command.

## Remote control

If user's Aside runs on a remote machine (e.g., this host is Linux but user runs Aside on their macOS laptop), you can control it with following commands:

```bash
aside host list
aside host profiles --host <id-or-name>
aside exec --host <id-or-name> "..."
aside repl --host <id-or-name>
aside host use <host>
```

You need to run `aside login` on the current host if Aside is not running locally.
On the remote host, remote control needs to be enabled on Settings > Developers and device needs to be online to show up in the list.
If the account has multiple browser profiles, choose an ID from `aside host profiles` and pass `--profile <id>` to `exec`, `repl`, or `mcp`. `--account` is a local account selector, not a remote browser profile selector. Existing sessions keep their original profile.
> Use `aside host use` to remember the host as the default for future commands.
