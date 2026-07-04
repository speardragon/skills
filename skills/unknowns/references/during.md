# During implementation — the deviation protocol

No plan survives contact with the territory. The failure modes are symmetric: stopping
at every surprise (paralysis) and silently improvising past every surprise (drift).
This protocol is the third path.

## When a surprise hits, classify it

**Class A — the plan's intent still holds, only the step is wrong.**
(An API differs from assumed, a file moved, an edge case needs one more branch.)
→ Take the **conservative** option — the one that changes the least observable
behavior — log it (below), and keep going. Do not stop.

**Class B — the surprise undermines the plan's intent or first principle.**
(The "identical" code wasn't; the feature belongs in a different layer; a constraint
makes the approach net-negative.)
→ Stop this thread. Surface immediately with: what you found, why it breaks the plan,
your recommended pivot, and what you'll do meanwhile (usually: continue unaffected
parts). Never silently push through, never silently pivot.

**Class C — out-of-scope discovery.** (A bug, an optimization, tech debt nearby.)
→ Log it and move on. Fixing unrequested things mid-task is drift wearing a helpful
mask. The log entry is the deliverable.

## The log

Keep one notes file per task. Location, in order of preference: the project's issue
file for this task (e.g. `.scratch/<feature>/issues/NN-*.md` under `## Comments`) →
a `NOTES.md` next to the plan → `implementation-notes.md` in the scratchpad.

Entry format — one entry per event, at the moment it happens (end-of-session batch
reconstruction loses the reasoning):

```markdown
- [Deviation|Blocked|Found] <where>: expected X, found Y → chose Z because <criterion>.
```

Three properties make an entry worth writing:
1. **The why is the payload.** "Chose Z" without the criterion teaches the next reader
   nothing and can't be reviewed.
2. **Rejected options count.** "Considered W, rejected: <reason>" prevents the next
   agent from re-walking the dead end — often the highest-value line in the file.
3. **Written for a reader with zero session context** — that reader may be the user
   tomorrow, another model, or you after a context compaction.

## Standing habits while implementing

- Re-read the plan's first principle before each risky step; drift accumulates through
  locally-reasonable choices whose sum violates a rule no single step violated.
- When a verification gate fails unexpectedly, revert the step and log — don't force
  fixes on top of a state you don't understand (a Class B signal in disguise).
- If deviations start clustering (3+ in one area), stop treating them as Class A —
  clusters mean the map is wrong there. Escalate to Class B.
