---
name: unknowns
description: >
  Structured discovery of unknowns — the gap between what the user asked for (the map)
  and what the work actually requires (the territory). Use at the START of any substantial
  or ambiguous task: new features, redesigns or visual work, unfamiliar domains, multi-day
  efforts, briefs that use adjectives instead of specs ("잘", "이쁘게", "제대로", "만능"),
  requests where several reasonable interpretations exist, or plans meant to be executed
  later by another agent. Also governs DURING long implementations (deviation protocol)
  and AFTER (verified understanding, handoff docs). Do NOT use for small, precisely
  specified, reversible changes — if unsure whether a task qualifies, read the Triage
  section and decide there. Trigger even when the user doesn't ask for "planning" —
  a vague large request IS the trigger.
---

# Unknowns — close the map/territory gap at the cheapest point

The user's prompt is a map. The codebase, the real world, and the user's own taste are
the territory. Every mismatch between them is an **unknown**, and every unknown gets
more expensive to fix the later it surfaces: a question costs seconds, a prototype costs
minutes, a wrong implementation costs hours, a shipped wrong feature costs trust.

Your job with this skill is NOT to run a ritual. It is to spend a small, proportional
budget early to find the unknowns that would otherwise burn a large budget late.

All user-facing output (questions, plans, reports) is in Korean unless the user writes
in another language. This file and its references are English because they instruct you.

## The four quadrants (diagnosis vocabulary)

| Quadrant | What it is | Cheapest probe |
|---|---|---|
| Known knowns | What the prompt already specifies | None — just honor it |
| Known unknowns | Gaps the user is aware of ("아직 못 정했는데…") | Targeted questions, options with a recommendation |
| Unknown knowns | Taste the user can't verbalize but recognizes on sight | Prototype / variants / mockup → let them react |
| Unknown unknowns | Constraints nobody has considered yet | Blindspot pass: codebase + domain research |

Most wasted work comes from the bottom two rows, because no amount of asking fixes them —
the user cannot answer questions about things they can't see or don't know exist. Asking
is for row 2; **showing** is for row 3; **researching** is for row 4. Choosing the wrong
probe (e.g., interviewing about visual taste) wastes everyone's time.

## Triage — decide the weight BEFORE doing anything

Score the request mentally. Do not show the user this rubric; just act on it.

**Skip the skill entirely (weight 0) — just do the task** when all of:
- The change is small, reversible, and verifiable (test/typecheck/quick look)
- One reasonable interpretation exists, or the repo has an established pattern to follow
- Getting it slightly wrong costs less than one clarifying round-trip

**Light pass (weight 1) — ≤2 load-bearing questions OR a 30-second stated-assumptions
list, then proceed** when: moderate scope, mostly clear, but 1-2 forks genuinely change
the outcome. Often the best form is: "이렇게 이해했고, A로 가정하고 진행할게 — 아니면
지금 말해줘" inside your first reply, not a blocking interview.

**Full pass (weight 2) — pick 1-3 techniques from the index below** when any of:
- Multi-session / multi-day scope, or a plan another agent will execute later
- The brief describes a feeling, not a behavior (adjectives, superlatives, "알아서")
- New domain for the user (they can't yet judge what "good" looks like)
- Irreversible or outward-facing actions (schema changes, published URLs, payments)
- You notice mid-read that two of the user's constraints conflict

**Budget rule:** unknowns work should cost roughly ≤10% of the estimated task. If your
discovery is exceeding that, you are probably interviewing about things you should be
deciding or researching yourself. Decide, state the assumption, move on.

## Technique index — symptom → probe

| Symptom you observe | Technique | Reference |
|---|---|---|
| User is new to this domain / can't judge quality yet | Blindspot pass | `references/pre.md` §1 |
| Taste-driven work (design, UX, tone) — "보면 안다" | Variants & prototypes | `references/pre.md` §2 |
| A few forks where the user's answer changes architecture | Load-bearing interview | `references/pre.md` §3 |
| User struggles to describe; something similar exists | Reference-as-spec | `references/pre.md` §4 |
| Big build about to start; assumptions need surfacing | Decision-first plan | `references/pre.md` §5 |
| Long implementation underway; plan meets reality | Deviation protocol | `references/during.md` |
| Work done; user needs to trust/understand/hand it off | Verified understanding | `references/post.md` |

Read only the reference for the phase you are in. Combine at most 2-3 techniques;
"all of them" is a smell, not thoroughness.

## Non-negotiables (calibration rules)

1. **Questions must be load-bearing.** Before asking anything, check: "would each
   possible answer change what I build?" If not, don't ask. Never ask what you can
   resolve by reading the code, the repo docs, or the web — resourcefulness first,
   questions second. Batch to ≤4 per round; lead with your recommendation.
2. **Show, don't interrogate, for taste.** For anything visual or tonal, produce
   2-4 genuinely different options (HTML mock, copy variants, API sketches) before
   asking a single question about preference. Reactions beat descriptions.
3. **State assumptions instead of stalling.** When an unknown is minor, pick the
   conservative option, write "가정: …" visibly in your output, and continue. The user
   correcting one line of assumptions is cheaper than answering an interview.
4. **Unknowns found late are findings, not failures.** If discovery mid-implementation
   reveals the task should be solved differently, surface it immediately with a
   recommendation — do not silently push through the original plan, and do not silently
   pivot either.
5. **Plans encode judgment, not just steps.** Any plan meant for later/another-agent
   execution must include: the first principle (what must not break), per-fork decision
   criteria, and a "record, don't fix" escape hatch for uncertainty. Steps without
   judgment criteria are where handoffs die.

## Persist what you learned (the compounding step)

A discovered unknown is a one-time cost only if it's written down where the next
session will find it. After any weight-2 engagement, spend one minute routing:

- **Repo-shaped facts** (couplings, gotchas, "X must stay in sync with Y") → the
  repo's knowledge docs (`AGENTS.md`, `CLAUDE.md`, or the project's issue tracker
  convention, e.g. `.scratch/<feature>/`)
- **User-shaped facts** (taste verdicts, standing preferences, "always ask before X")
  → memory, so future sessions stop re-asking
- **Task-shaped facts** (deviations, rejected approaches and why) → the task's plan
  or notes file (see `references/during.md`)

Skipping this step means paying for the same unknown again next month.
