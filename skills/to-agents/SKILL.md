---
name: to-agents
description: 'Delegate a task to another coding agent inside herdr 0.7.5+: create a pane/tab/workspace, start a NAMED agent in auto (permission-relaxed) mode, dispatch the task with a delivery-verified prompt, then return immediately or wait server-side. Use when running inside herdr (HERDR_ENV=1) and the user asks to spawn an agent or offload work: "launch claude", "one more codex", "split next to me and run claude", "have a codex fix X", "to-agents". Supersedes the legacy herdr-agent skill on herdr 0.7.5+.'
---

# to-agents — delegate work to another agent in herdr

Delegation runs in two phases: **dispatch** (create a pane, start a named agent in auto mode, deliver the task, verify delivery) and **collect** (get the result back — by callback, by waiting inline, or on demand later). Default is async: dispatch, report, end your turn; the delegate reports back into your pane when it finishes.

Built on herdr 0.7.5's named-agent commands (`agent start` / `agent prompt` / `agent wait`). Low-level herdr control lives in the `herdr-cli` skill; on herdr ≤ 0.7.4 these commands don't exist — use the legacy `herdr-agent` skill there.

## 0. Guard and identity

```bash
[ "$HERDR_ENV" = "1" ] || { echo "not inside herdr — stop"; exit 1; }   # must abort, not just echo
PARENT="$HERDR_PANE_ID"
eval "$(herdr pane get "$PARENT" | python3 -c 'import sys,json;p=json.load(sys.stdin)["result"]["pane"];print("PARENT_AGENT=%s\nPARENT_WS=%s\nPARENT_CWD=%s"%(p.get("agent") or "agent",p.get("workspace_id") or "",p.get("cwd") or ""))')"
```

Your own location comes only from `$HERDR_PANE_ID` (`focused:true` is whatever the user's UI is looking at). If `herdr agent prompt` is not in `herdr --help` output, the binary predates 0.7.5: tell the user to run `herdr update` (or use the legacy `herdr-agent` skill) and stop.

**Done when:** `PARENT`, `PARENT_AGENT`, `PARENT_WS`, `PARENT_CWD` are set.

## 1. Parse intent

Extract from natural language; defaults when unspecified:

| Item        | Value                                  | Default                          |
| ----------- | -------------------------------------- | -------------------------------- |
| Location    | pane split / new tab / new workspace / worktree | split next to me         |
| Kind        | claude / codex / other supported kind  | claude                           |
| Count       | N                                      | 1                                |
| Permissions | auto / normal / plan                   | **auto**                         |
| Task        | what the delegate should do            | none → just open, no dispatch    |
| Collect     | async callback / inline wait           | async                            |

Pick a **name** per delegate from its role — `reviewer`, `fixer`, `translator-2` — matching `[a-z][a-z0-9_-]{0,31}`, unique among live agents (`herdr agent list` shows taken names; on a conflict error, add a numeric suffix and retry). The name is the handle for every later command and for the callback.

New-workspace cwd: use the given path; if none was given, a new workspace usually means a different project — ask a one-line follow-up. For "isolated checkout" / "worktree" requests, `herdr worktree create --branch <name>` creates the workspace.

**Done when:** every row of the table has a value and each delegate has a name.

## 2. Create the location

Create the pane first — `agent start` never creates layout. Keep the user's focus (`--no-focus`) and pin the working directory (`--cwd`). For splits, match geometry: `herdr pane layout --current`, then split a wide pane `right`, a narrow or tall pane `down`.

```bash
# split (default) — new pane id at result.pane.pane_id
NEW_PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')

# new tab / new workspace — new pane id at result.root_pane.pane_id
NEW_PANE=$(herdr tab create --workspace "$PARENT_WS" --cwd "$PWD" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
NEW_PANE=$(herdr workspace create --cwd "$CWD" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
```

A fresh pane per delegate also keeps every later status fresh — a level-triggered wait can never match a stale `idle` from some earlier task.

**Done when:** `NEW_PANE` holds an id parsed from the response json (never a guessed one).

## 3. Start the agent — auto mode at launch

Delegated tasks used to strand on permission prompts (`blocked` on every edit or command). The fix is at launch: pass the agent's own permission-relaxing flags after `--`, so the delegate never asks. No badge-cycling with Shift+Tab afterwards — the flags do it.

```bash
herdr agent start "$NAME" --kind claude --pane "$NEW_PANE" -- --permission-mode bypassPermissions
```

| Kind   | auto (default)                         | milder options user may ask for                  |
| ------ | -------------------------------------- | ------------------------------------------------ |
| claude | `--permission-mode bypassPermissions`  | `--permission-mode acceptEdits`, `--permission-mode plan` |
| codex  | `--full-auto`                          | `--yolo` is the *stronger* form (no sandbox) — only on explicit request |
| other  | start bare; check that binary's `--help` for an approvals flag if the user wants auto |

`agent start` returns only when the agent is detected in the pane and ready for input — it is the readiness check. Handle its failures:

- **claude's bypass-permissions confirmation** on screen (`agent read "$NEW_PANE" --source visible --lines 20`): accepting it is exactly the auto mode the user asked for — select the accept option shown, then confirm readiness with `herdr agent wait "$NAME" --until idle --until done --timeout 15000`.
- **any other first-run screen** (login, model choice, trust-folder): report it to the user and hand over; choosing on their behalf is not this skill's call.
- **name already taken**: retry with a suffixed name.

**Session id (when the caller needs resume/tracking later):** read it from `herdr agent get "$NAME"` → `agent.agent_session.value` — the only reliable source. For claude you can pin it upfront (`-- --session-id <uuid>`); resume later with `claude --resume <id>` / `codex resume <id>`. Never scrape agent-side files like `~/.codex/session_index.jsonl` — they lag behind and return stale ids from unrelated sessions.

**Done when:** `agent start` (or the post-confirmation wait) has returned success for every delegate.

## 4. Dispatch — deliver, verify, return

Compose one message: the task, a short delegation context, and the callback line. Parent variables expand now, so your identity travels with the task; the delegate's own name is baked in literally.

```bash
herdr agent prompt "$NAME" "<the task, in natural language>

---
Context: you were started by another agent (${PARENT_AGENT} at pane ${PARENT}, workspace ${PARENT_WS}, cwd ${PARENT_CWD}) to do this task autonomously. Work it to completion.
When finished, report back exactly once by running:
  herdr agent prompt ${PARENT} \"[${NAME} done] <one-line result>\"
If you hit a question only a human can answer, stop and wait — your pane status will show it." \
  --wait --until working --timeout 15000
```

The `--wait --until working` is a **delivery receipt**: it returns the moment the delegate starts working, so you never end your turn on a prompt that silently landed in a dead screen. Two failure signals, both meaning "diagnose, don't resend blindly":

- `agent_prompt_stalled` — the prompt produced no state change within 5s (a modal is up, or the text went somewhere unexpected). `agent read "$NAME"` and report what's blocking.
- timeout — check `herdr agent get "$NAME"`: `idle`/`done` can mean the task finished faster than the receipt; read the pane before treating it as a failure.

Then **end your turn**. The callback arrives in your pane later as a new message like `[reviewer done] coverage reviewed, 3 gaps found` — pick up from there. **No-task case:** the user only wanted an agent open — stop after step 3 and report it ready.

**Done when:** every delegate shows a delivery receipt (or a diagnosed failure), and your report to the user is written.

## 5. Collect — the wait patterns

**Inline (user said to wait / short task):** dispatch with settled-state wait instead of the receipt, then read and summarize in the same turn:

```bash
herdr agent prompt "$NAME" "<task + context block>" --wait --timeout 300000
herdr agent read "$NAME" --source recent-unwrapped --lines 120
```

`--wait` without `--until` settles on `idle`, `done`, or `blocked`. On `blocked`, you are the delegate's manager: read the screen and answer it yourself with another `agent prompt` or `agent send-keys`, then wait again.

**Check on demand** (user asks "how's the reviewer doing?"):

```bash
herdr agent get "$NAME"                                        # status now
herdr agent read "$NAME" --source recent-unwrapped --lines 120 # transcript
herdr agent wait "$NAME" --timeout 60000                       # block until settled
```

**Babysit** (user says "watch it until it's done"): loop on `herdr agent wait "$NAME" --timeout <t>` — `blocked` → read, unblock, wait again; `idle`/`done` → read and report. `agent_not_running` means the delegate's pane closed: report it, with the last transcript if any.

**Fan-out** (N delegates): dispatch each with its own name and receipt, then collect with sequential `agent wait <name>` calls — waits are level-triggered, so already-finished delegates return instantly. Reading a result does not consume its `done` badge (only focusing does), so the human's sidebar still shows what finished.

## 6. Report

One line per delegate; append config as single tokens:

```
- reviewer (w1:p4, split right) — claude · auto · dispatched, reports back ↩
- fixer (w2:p1, new workspace ~/proj) — codex · full-auto · inline: done ✓ 3 files changed
- translator (w1:p5, tab) — claude · auto · ⚠ stalled (screen: login prompt)
```

## Guardrails

- One task per delegate at a time — parallelism comes from more named delegates, not queued prompts.
- Leave delegates and their panes open for the human to inspect; close only what the user asks to close.
- Report failures factually (what the screen shows), then hand over — a stalled delegate is the user's decision point, not a retry loop.
