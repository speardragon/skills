# Post-implementation — verified understanding & handoff

Finished work the user doesn't understand is a new unknown you just created: they can't
review it, defend it, or build on it. The goal here is transferring the *territory
knowledge* you gained, proportionally.

## Default: the surprise-led summary (every substantial task)

Structure the final report around what the user doesn't already know, not around your
chronology:

1. **Outcome first** — what now works/exists, in one or two sentences.
2. **"놀랄 만한 것들"** — the 1-4 things that would surprise someone who only read the
   original request: deviations taken, discoveries that changed the approach, behavior
   that differs from what they might assume. This section is the heart; if it's empty,
   say so explicitly ("계획 대비 이탈 없음") — that's information too.
3. **What was NOT done** — deferred items, logged-not-fixed findings, assumptions that
   still need their confirmation. Silent omissions destroy trust; stated ones build it.
4. Pointers to the deviation log / plan diff for the full record.

## On request: deeper transfer

**Explainer / pitch doc** — when the work needs buy-in from someone who wasn't in the
session (a teammate, a reviewer, future-user-in-3-months). Package: what & why → demo
or before/after → how the known risks were handled → open questions. Lead with the
thing a skeptic would poke at. Single HTML file if visual, markdown otherwise.

**Comprehension check** — when the user says they want to *understand* the change
(not just accept it), or before they merge something risky. Walk through the change as
a guided tour of decision points ("여기서 A 대신 B를 쓴 이유는?") rather than a diff
dump. A quiz is optional garnish — offer it, don't impose it; and remember its honest
limit: you grading answers about your own work verifies *their* recall, not *your*
correctness. Correctness verification belongs to tests/review, not quizzes.

**Handoff doc** — when another agent/person continues the work. Contents: current
state (done/in-progress/not-started), the plan's first principle restated, the
deviation log, the next 1-3 concrete steps, and the traps ("X를 건드리면 Y가 깨짐").
Write for zero shared context.

## Always: route the durable facts

Post-implementation is when discovered unknowns are freshest and cheapest to persist.
Before closing, run the SKILL.md persistence routing: repo-shaped facts → repo docs;
user-shaped facts → memory; task-shaped facts → the task's notes. One minute now saves
the same discovery being paid for again next session.
