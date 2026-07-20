---
name: herdr-agent
description: 'Spawn a coding agent (claude / codex / any) into a new herdr location — a new tab, a pane split, or a new workspace — and delegate a task to run asynchronously. By default the parent does NOT block: it dispatches the task marked as agent-delegated, passes along its own identity (pane id, agent, workspace), and ends its turn. The spawned agent does NOT report back on its own — it works, then waits for the human manager at its pane to approve completion, asks whether to notify the parent, and only then types the report into the parent''s pane and submits it (re-triggering the parent). Use when running inside herdr (HERDR_ENV=1) and the user asks to open/launch/spawn an agent or offload work: "launch claude", "one more codex", "split next to me and run claude", "codex in a new workspace", "have a codex fix X".'
---

# herdr-agent — spawning agents in herdr

A skill for spawning a coding agent (claude / codex / anything else) into a new location inside herdr and **handing it a task to run on its own**. Low-level herdr control is handled by the `herdr-cli` skill; this skill layers an "agent spawn" workflow on top of it.

**Default flow: pick a location → start the agent → delegate the task (marked as agent-delegated, carrying your identity + a human-gated callback protocol) → return immediately (don't block).** The spawned agent does not report back on its own: it works, waits for the human manager at its pane to approve, asks whether to notify you, and only then types the result into your pane — re-triggering you. If there's no task (the user just wants an agent open), fall back to spawning and confirming idle. Extra configuration like auto mode and rc is not part of the main flow — it lives in the [appendix](#appendix--extra-configuration) (only when the user explicitly asks).

## Main flow

### 0. Guard

If `HERDR_ENV != 1`, **stop immediately** and tell the user "not inside herdr, so I can't spawn an agent".

```bash
[ "$HERDR_ENV" = "1" ] || { echo "not inside herdr — stop"; exit 1; }   # echo alone won't stop — you must abort
herdr pane get "$HERDR_PANE_ID"   # determine my pane/tab/workspace/cwd
```

Always determine your own location via `$HERDR_PANE_ID`. `focused:true` is the pane the user's UI is looking at, not your pane.

> ids look like `w1K`, `w1K:t6`, `w1K:pA` (alphanumeric allowed). Always re-read them from the `pane get`/`list`/`split` response (they may be compacted).

### 1. Parse intent

Extract from natural language. Use defaults when unspecified.

| Item                | Value                                | Default        |
| ------------------- | ------------------------------------ | -------------- |
| Target              | new tab / pane split / new workspace | new tab        |
| Agent               | claude / codex / other               | claude         |
| Count               | N                                    | 1              |
| Split direction     | right / down                         | right          |
| cwd (new workspace) | path                                 | rule below     |
| **Task**            | what the child should do             | none → just open |

Examples: "split next to me and have codex check the translation" → codex in a split right, task = check the translation / "one more claude" → claude in a new tab, no task / "two claudes in a new workspace to run the migration" → workspace ×2, task each.

**Capture your own pane id now: `PARENT=$HERDR_PANE_ID`** (from step 0). That's where each child will report back when its task is done.

**New-workspace cwd**: if a path is given, use it as-is. If not, default to the current cwd — but "new workspace" usually means a different project, so **if ambiguous, ask a one-line follow-up**.

> auto mode and rc are not in the main flow. If the user explicitly says "in auto mode", "with remote control", etc., see the [appendix](#appendix--extra-configuration).

### 2. Create the target

Create a pane for each target and **parse the new pane id (`NEW_PANE`) from the response json**. Whatever the target, §3 starts the agent in this `NEW_PANE`. Because the json path differs per target (split is `result.pane.pane_id`; tab/workspace are `result.root_pane.pane_id`), parse them uniformly as below. Use `--no-focus` to keep your own focus. For N, repeat N times.

```bash
# new tab — root_pane.pane_id
NEW_PANE=$(herdr tab create --workspace "$WS" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

# pane split — pane.pane_id
NEW_PANE=$(herdr pane split "$HERDR_PANE_ID" --direction right --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')

# new workspace — root_pane.pane_id (if you also need the workspace/tab id, parse result.workspace / result.tab too)
NEW_PANE=$(herdr workspace create --cwd "$CWD" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
```

> herdr 0.7.4+ also has a one-step `herdr agent start <name> [--split right|down] [--workspace ID] [--no-focus] -- <argv...>` that creates the location **and** launches the agent together. We keep the explicit two-step (create location → §3 `pane run`) here on purpose: §3 needs the `NEW_PANE` id to inject the delegation/identity header and later receive the callback, and the two-step gives us that id plus a clean point to check for first-run blockers before delivering the task. Use `agent start` for the no-task "just open an agent" case if you prefer.

### 3. Hand off the task and return — the core (async by default)

The default assumption: the agent is spawned **to do a task**, and you should **not block** until it finishes. You wait only long enough to deliver the task, hand it the task plus your identity and a human-gated callback protocol, then end your turn. Crucially, the child **does not report back on its own** — it works, then waits, and only reports to you **after the human manager at its pane approves** (and after asking first). This keeps a human in the loop before a delegated result re-triggers you.

`agent_status` is the ready signal (not on-screen text). A new pane reads `unknown`; once the agent starts, herdr marks it `idle`. You wait for `idle` **only to deliver the task**, not for the task to complete.

```bash
PARENT="$HERDR_PANE_ID"                                   # from step 0 — who delegated (callback target)
# Capture your identity so it travels with the task (agent kind, workspace, cwd):
eval "$(herdr pane get "$PARENT" | python3 -c 'import sys,json;p=json.load(sys.stdin)["result"]["pane"];print("PARENT_AGENT=%s\nPARENT_WS=%s\nPARENT_CWD=%s"%(p.get("agent") or "agent",p.get("workspace_id") or "",p.get("cwd") or ""))')"
herdr pane run "$NEW_PANE" "claude"                       # or "codex", etc.
herdr wait agent-status "$NEW_PANE" --status idle --timeout 30000
herdr pane read "$NEW_PANE" --source visible --lines 20   # check for first-run blockers
```

> Caution: **`idle` means "not working", not "prompt ready for input".** First-run prompts (login / model selection / trust folder) can look idle. If one is on screen you can't deliver the task — **don't guess keys; report it and hand to the user.**

If the child is ready, deliver the task with the delegation header + human-gated callback protocol using `herdr pane run` (the same mechanism `herdr-agent-run-and-wait` uses — it types the prompt into the running agent and submits it, multi-line safe). Then **return immediately — do not wait for completion:**

```bash
herdr pane run "$NEW_PANE" "<the task, in natural language>

[DELEGATED TASK — assigned by another AGENT, not a human]
Delegated by: ${PARENT_AGENT} in herdr pane ${PARENT} (workspace ${PARENT_WS}, cwd ${PARENT_CWD}).

Handoff protocol — follow exactly:
1. State up front, to the human at this pane, that this task was delegated by the parent agent above.
2. Do the task. Do NOT contact or report to the parent on your own — run no '${PARENT}' commands yet.
3. When you believe you're finished, STOP and wait. Do not report.
4. Only when the human manager here explicitly says it is complete/approved, ask them: '부모 에이전트(pane ${PARENT})에게 완료 보고를 전달할까요?'
5. Only if the manager confirms, report back exactly once by running:
     herdr pane run ${PARENT} \"[\$HERDR_PANE_ID done] <one-line result>\"
   (this types the report into the parent's pane and submits it with Enter). If the manager says no, do not contact the parent."
```

> Quoting: `${PARENT}`, `${PARENT_AGENT}`, `${PARENT_WS}`, `${PARENT_CWD}` expand **here** (your identity travels with the task); `\$HERDR_PANE_ID` stays **literal** so the child fills in its own pane id when it reports. `herdr pane run <pane> "<text>"` delivers a prompt to a running agent and submits it — that's how the child receives the task and, later, how it types the report into your pane. After sending, your turn ends; the child works, waits for its human's approval, and only then re-triggers you.

**No-task case** — if the user only wants an agent open ("split a claude next to me") with nothing to run, skip the task delivery: confirm `idle`, check for blockers, report it ready. That's the whole job.

**On timeout** (idle never reached) → don't guess keys. Read further and report what's blocking.

```bash
herdr pane read "$NEW_PANE" --source recent-unwrapped --lines 30   # diagnose on timeout
```

> `wait agent-status` is level-triggered, so an already-idle pane returns immediately. **Always start in a new pane** so a prior idle isn't mistaken for this one.

### 4. Report — a simple list

One line per spawned agent. No tables, no verbose logs, no links.

```
- w1K:pA (split right) — codex · task delegated, reports back after its manager approves ↩
- w1K:p9 (tab) — claude · idle ✓ (no task)
- w2A:p1 (new workspace /path/to/proj) — claude · ⚠ timeout (screen: login prompt)
```

Then your turn ends. **The callback is human-gated: it lands in your pane only after that child's manager approves it** — as a new message like `[w1K:pA done] translation checked, 3 fixes`. Pick up from there when it arrives; don't expect it the moment the task finishes. For any agent that couldn't be handed its task (blocker/timeout), state what was blocking, factually; don't kill it or retry endlessly. If you applied extra configuration (auto/rc), append the result as a single token too (e.g. `· auto ✓`).

### Synchronous mode — wait for the task inline (opt-in)

The default is async (callback). Only when the user explicitly wants you to **wait and bring the result back in the same turn** ("기다려서 받아와", "block until it's done") use the `herdr-cli` skill instead of the callback footer: its `herdr-agent-run-and-wait` helper sends the prompt and safely waits for `working → idle/done`, then you read the pane and report. Fine for short tasks; prefer the async default for anything long.

## Core principles

- Determine your own location only via `$HERDR_PANE_ID` (never `focused`) — and capture it as `PARENT` so children can report back to you.
- Always re-parse ids from the response (don't assume they stay stable after compaction).
- Wait for `agent_status idle` only to deliver the task; after that, read the screen once for first-run blockers (idle ≠ ready for input).
- If blocked, don't guess and press keys — read the tab and report.
- **Default is async + human-gated:** hand off the task with your identity and the delegation/callback protocol, then return. Mark the task as agent-delegated, pass your pane id + info, and instruct the child to report back **only after its human manager approves** (asking first, then typing into your pane and submitting). The child must not contact you before that. Block inline only when the user asks (see Synchronous mode).

---

## Appendix — extra configuration

The main flow ends at "task dispatched" (or "idle" for the no-task case). Below is claude-only extra configuration, applied **only when the user explicitly requests it**. (Other agents like codex don't have these concepts — starting them is all there is.) When you do apply auto/rc, do it after the agent is idle and before sending the task.

### Changing auto mode (claude only)

Unnecessary if the default mode is already auto. Only when the user wants a specific mode ("in plan mode", "switch to auto") or the default isn't auto.

Cycle modes with Shift+Tab (`\e[Z`). Order (4-state):
`normal → ⏵⏵ accept edits on → ⏸ plan mode on → ⏵⏵ auto mode on → normal`

Procedure — **compute, then verify**:

1. Read the current badge by content: `herdr pane read "$P" --source visible --lines 14 | grep -oE "accept edits on|plan mode on|auto mode on"` (none → normal).
2. Compute the number of presses N needed to reach the target (e.g. normal→auto = 3, accept→auto = 2, plan→auto = 1).
3. `for i in $(seq 1 "$N"); do herdr pane send-text "$P" $'\e[Z'; sleep 0.4; done`
4. Read again and confirm the target badge. If it's off (e.g. version change), send `\e[Z` one at a time to correct, up to 5 times. If still wrong, report the screen state.

### rc (remote control, claude only)

For when you want to continue the session from your phone / claude.ai.

```bash
herdr pane send-text "$P" "/rc"; sleep 0.6
herdr pane send-keys "$P" Enter; sleep 1.5
herdr pane read "$P" --source visible --lines 20
```

For verification, only check **whether the status bar shows `/rc active`** (don't parse the remote link). If it's not shown, report the screen state.

> rc is claude-only. codex has a separate CLI feature called `codex remote-control`, but it differs from this skill's purpose (bridging an interactive session inside a herdr pane to phone/claude.ai), so it is **not covered.** If the user wants remote control for codex, tell them it's out of scope for this skill.
