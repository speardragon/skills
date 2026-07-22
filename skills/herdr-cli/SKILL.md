---
name: herdr-cli
description: "Control herdr from inside it. Manage workspaces and tabs, split panes, start and prompt agents, read output, and wait for state changes — all via CLI commands that talk to the running herdr instance over a local unix socket. Use when running inside herdr (HERDR_ENV=1). Targets herdr 0.7.5+."
---

# herdr — agent skill

before using this skill, check that `HERDR_ENV=1`. if it is not set to `1`, say you are not running inside a herdr-managed pane and stop. do not inspect or control the focused herdr pane from outside herdr.

you are running inside herdr, a terminal-native agent multiplexer. herdr gives you workspaces, tabs, and panes — each pane is a real terminal with its own shell, agent, server, or log stream — and you can control all of it from the cli.

this means you can:

- see what other panes and agents are doing
- create tabs for separate subcontexts inside one workspace
- split panes and run commands in them
- start servers, watch logs, and run tests in sibling panes
- wait for specific output before continuing
- start a named agent, prompt it, and wait for it to settle

the `herdr` binary is available in your PATH. its workspace, tab, pane, agent, worktree, notification, and integration commands talk to the running herdr instance over a local unix socket.

this file targets **herdr 0.7.5+**. verify with `herdr --version`. 0.7.5 renamed the wait and agent-send commands (`herdr wait output` → `herdr pane wait-output`, `herdr wait agent-status` → `herdr agent wait`, `herdr agent send` → `herdr agent send-keys`) and redefined `herdr agent start` — on an older binary those forms do not exist, so suggest `herdr update` to the user and treat the installed binary's `--help` as the authority. if you need the raw protocol or full api reference, read the [socket api docs](https://herdr.dev/docs/socket-api/).

## concepts

**workspaces** are project contexts. each workspace has one or more tabs. unless manually renamed, a workspace's label follows the first tab's root pane — usually the repo name, otherwise the root pane's current folder name.

**tabs** are subcontexts inside a workspace. each tab has one or more panes.

**panes** are terminal splits inside a tab. each pane runs its own process — a shell, an agent, a server, anything.

**agent status** is detected automatically by herdr. the api exposes one public field for it, `agent_status`:

- `idle` — ready for input, and its tab has been seen in the focused herdr ui
- `working` — actively running
- `blocked` — herdr recognized an approval or question ui
- `done` — the same underlying idle state, but the work finished while the tab was unseen. focusing the tab or agent marks it seen; cli reads do not.
- `unknown` — an agent is present but herdr cannot classify it confidently. it does not prove completion.

plain shells still exist as panes, but herdr's sidebar agent section intentionally focuses on detected agents rather than listing every shell.

**ids** — workspace ids look like `w1`, tab ids like `w1:t1`, pane ids like `w1:p1`. public ids are opaque stable handles: closed tab and pane ids are not reused. a pane moved into another workspace receives a new workspace-qualified id — after `pane move`, continue with `.result.move_result.pane.pane_id`. always parse ids from command responses (`workspace list`, `pane list`, create/split responses) instead of predicting them.

**agent targets** — agent commands accept a unique live agent name or the pane id currently hosting that agent, not bare kind labels. names are set by `agent start` or `agent rename`, match `[a-z][a-z0-9_-]{0,31}`, are unique among live agents, and are cleared when that agent exits or is replaced.

## discover yourself

**you are the pane named by `$HERDR_PANE_ID`.** herdr injects the caller's context into every managed pane:

```bash
printf '%s\n' "$HERDR_WORKSPACE_ID" "$HERDR_TAB_ID" "$HERDR_PANE_ID"
herdr pane get "$HERDR_PANE_ID"    # resolves your cwd, tab, workspace
```

"current workspace" and "current tab" mean _these_ — the ones your agent pane lives in. when the task says to test in the current workspace/tab, split or create from these ids, not from whatever else is on screen. many pane commands also accept `--current` to target the calling pane directly (`herdr pane current --current`, `herdr pane split --current …`).

do **not** use `focused` to find yourself. `focused:true` is whichever pane the user's herdr ui is looking at right now — often a different agent's pane entirely. when several agents run at once, multiple panes show `agent_status: working` and your own pane is usually `focused:false`. the only reliable self-signal is `$HERDR_PANE_ID` (or `--current`).

see every pane and its neighbors:

```bash
herdr pane list
```

list workspaces and agents:

```bash
herdr workspace list
herdr agent list
```

## tab management

list tabs in the current workspace:

```bash
herdr tab list --workspace "$HERDR_WORKSPACE_ID"
```

create a new tab (`--cwd` sets its starting directory; without `--label` it keeps the default numbered name):

```bash
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label "logs"
```

rename, focus, close:

```bash
herdr tab rename w1:t2 "logs"
herdr tab focus w1:t2
herdr tab close w1:t2
```

## read another pane

see what is on another pane's screen:

```bash
herdr pane read w1:p1 --source recent --lines 50
```

- `--source visible` = current viewport
- `--source recent` = recent scrollback as rendered in the pane
- `--source recent-unwrapped` = recent terminal text with soft wraps joined back together — prefer it for logs and transcripts
- `--source detection` = the plain-text bottom-buffer snapshot herdr uses for agent detection
- `--format ansi` (or `--ansi`) = rendered ANSI snapshot, when colors and styling are evidence

`herdr agent read <target>` takes the same options and resolves through the agent name.

## split a pane and run a command

pick the direction from geometry: check your pane with `herdr pane layout --current`, split a wide pane right and a narrow or tall pane down. keep focus with `--no-focus`, and preserve your working directory explicitly with `--cwd`:

```bash
NEW_PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
```

split downward instead with `--direction down`.

## wait for output — `pane wait-output`

block until specific text appears in a pane. useful for waiting on servers, builds, and tests.

```bash
herdr pane wait-output w1:p3 --match "ready on port 3000" --timeout 30000
```

with a rust regex:

```bash
herdr pane wait-output w1:p3 --regex "server.*ready" --timeout 30000
```

the selected snapshot (default `--source recent`, unwrapped, latest 80 rows) is searched immediately — output that already exists can match — then polled. omit `--timeout` to wait indefinitely. on timeout or server error the cli prints json on stderr and exits `1`; usage errors exit `2`.

## wait for an agent — `agent wait`

block until an agent settles:

```bash
herdr agent wait w1:p1 --timeout 120000
```

without `--until`, this matches `idle`, `done`, or `blocked` — finished or needs attention. narrow it with repeatable `--until` for state-specific flows:

```bash
herdr agent wait reviewer --until blocked --timeout 120000     # wake only when it needs input
herdr agent wait w1:p1 --until done --until blocked            # background completion or a question
```

`agent wait` is level-triggered: if the current status already matches, it returns immediately — so a stale `idle` from before your prompt looks identical to a fresh completion. when you are the one sending the prompt, use `agent prompt --wait` (next section); it is baseline-safe. if the target pane closes mid-wait, the command fails promptly with `agent_not_running`.

## send a task and wait — `agent prompt`

`herdr agent prompt <target> "<text>"` types the prompt into a running agent and submits it — atomic text-plus-Enter, honoring the pane's live bracketed-paste mode, safe for multi-line prompts even while the agent is working. with `--wait` it also waits for the first settled state after submission:

```bash
herdr agent prompt reviewer "review the test coverage in src/api/" --wait --timeout 120000
herdr agent read reviewer --source recent-unwrapped --lines 120
```

the stale-status safety that this skill's old `herdr-agent-run-and-wait` / `herdr-agent-wait-complete` helper scripts hand-rolled is now server-side, so those scripts are gone:

- **stall guard** — a prompt sent from a non-working state must produce an observed state change within 5 seconds, otherwise the command returns `agent_prompt_stalled` instead of mistaking a leftover `idle`/`done` for completion. a stall means the prompt did not take (a modal or login screen is up, or the text landed somewhere unexpected): `agent read` the pane and diagnose.
- **settled defaults** — after the state change it matches `idle`, `done`, or `blocked`. those are the defaults; pass `--until` only to narrow them.
- **turn caveat** — the wait tracks lifecycle state, not an individual turn. if the agent was already working, completion of the active turn may satisfy it. run one task at a time per agent.

on `blocked`, read the pane and respond instead of waiting longer. for deterministic shell commands, prefer `pane run` + `pane wait-output` on the command's own output.

## agent-native commands (`herdr agent …`)

the agent command family targets detected agents through a name or hosting pane id:

```bash
herdr agent list                                  # every detected agent + its pane/status
herdr agent get <target>                          # one agent's info (agent, agent_status, pane_id, cwd)
herdr agent read <target> --source recent-unwrapped --lines 80
herdr agent wait <target> --timeout 30000
herdr agent prompt <target> "<text>" [--wait]
herdr agent send-keys <target> esc                # logical keys on the agent surface
herdr agent focus <target>                        # also marks a done agent as seen
herdr agent rename <target> <name>|--clear
herdr agent explain <target> [--json]             # diagnostic: how herdr detected this agent's state
```

**start a named agent in an existing pane** — in 0.7.5, `agent start` never creates or changes layout. create the pane first, then start the agent in it:

```bash
NEW_PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr agent start reviewer --kind claude --pane "$NEW_PANE" -- --permission-mode plan
```

- the pane must be at its interactive shell prompt with nothing running in the foreground.
- `--kind` picks the canonical executable (`claude`, `codex`, `gemini`, and more — run `herdr agent` for the installed list). everything after `--` is passed to that executable unchanged.
- the command returns only when the expected agent is detected in the pane and ready for input (default timeout 30000ms, max 300000) — it replaces the old start-then-wait-for-idle-then-screen-check dance.
- the name (`reviewer`) becomes the agent's handle for `prompt`, `wait`, `read`, `get`.

for full delegation workflows on top of this — spawning agents in auto mode and handing off tasks — use the `to-agents` skill.

## agent state detection (integrations)

`agent_status` is normally inferred from screen output, but installing the matching integration gives herdr **authoritative** state straight from the agent instead of screen-scraping:

```bash
herdr integration install claude       # writes ~/.claude/hooks/herdr-agent-state.sh
herdr integration status               # shows installed/outdated hooks per agent
```

when a hook is installed the agent self-reports via `herdr pane report-agent …` under the hood, so `agent wait` / `agent prompt --wait` become far more reliable. keep hooks current with `herdr integration status --outdated-only`.

## send text or keys to a pane

send literal text without pressing Enter:

```bash
herdr pane send-text w1:p1 "hello from claude"
```

press keys:

```bash
herdr pane send-keys w1:p1 enter
```

keys are herdr key-combo strings, validated before any bytes are written: named keys (`enter`, `tab`, `esc`, `backspace`, `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown`, `insert`, `delete`), single characters, and modifier chords (`ctrl+c`, `alt+enter`, `shift+tab`). `shift+tab` works directly — e.g. to cycle claude's permission mode — so the old `send-text $'\e[Z'` workaround is unnecessary. legacy `C-c` / `c-c` are aliases for `ctrl+c`. an unsupported key fails with `invalid_key` and writes nothing.

`pane run` sends the text and then a real Enter in one atomic request:

```bash
herdr pane run w1:p1 "echo hello"
```

use `pane run` for shells and raw terminals; use `agent prompt` for agents.

## workspace management

create a new workspace (without `--label` it keeps the default cwd-based name):

```bash
herdr workspace create --cwd /path/to/project --label "api server" --no-focus
```

focus, rename, close:

```bash
herdr workspace focus w2
herdr workspace rename w1 "api server"
herdr workspace close w2
```

`herdr worktree create --branch <name>` creates and opens a git-worktree-backed workspace when a delegate should work on an isolated checkout.

## close a pane

```bash
herdr pane close w1:p3
```

## notify the user

post a toast in the herdr ui — useful when finishing long background work:

```bash
herdr notification show "tests passed" --body "42 passed, 0 failed" --sound done
```

## recipes

### run a server and wait until it is ready

```bash
NEW_PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
herdr pane wait-output "$NEW_PANE" --match "ready" --timeout 30000
herdr pane read "$NEW_PANE" --source recent --lines 20
```

### run tests in a separate pane and inspect the result

```bash
NEW_PANE=$(herdr pane split --current --direction down --cwd "$PWD" --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "cargo test"
herdr pane wait-output "$NEW_PANE" --match "test result" --timeout 60000
herdr pane read "$NEW_PANE" --source recent --lines 30
```

### check what another agent is working on

```bash
herdr agent list
herdr agent read w1:p1 --source recent-unwrapped --lines 80
```

### spawn a new agent and give it a task

```bash
NEW_PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr agent start reviewer --kind claude --pane "$NEW_PANE"
herdr agent prompt reviewer "review the test coverage in src/api/" --wait --timeout 120000
herdr agent read reviewer --source recent-unwrapped --lines 120
```

### coordinate with another agent

```bash
herdr agent wait w1:p1 --until done --until blocked --timeout 120000
herdr agent read w1:p1 --source recent-unwrapped --lines 100
```

## notes

- most control commands print json on success; `pane read` / `agent read` print text. cli server errors are json on stderr with exit status `1`; cli syntax errors exit `2`.
- parse ids from `workspace create` (`result.workspace`, `result.tab`, `result.root_pane`), `tab create` (`result.tab`, `result.root_pane`), and `pane split` (`result.pane.pane_id`) responses when you need new ids.
- use `pane read` for output that already exists; `pane wait-output` searches existing output first and then polls for more.
- `--no-focus` on split, tab create, and workspace create keeps the user's current focus unchanged. do not close workspaces, tabs, or panes you did not create unless the user asked.
- if `--lines` stops revealing more of a completed agent response, the agent is likely on the terminal's alternate screen and the missing rows never entered scrollback. as a fallback, ask that agent to write its full response to a file in a temporary directory and reply with the path, then read the file.
- never run `herdr server stop` from an active session unless the user explicitly intends to stop the server and every pane process in it.
- if you are running inside herdr, the `HERDR_ENV` environment variable is set to `1`.
