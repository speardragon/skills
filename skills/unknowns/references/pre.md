# Pre-implementation techniques

Five probes for closing the map/territory gap before code is written. Pick by symptom
(see SKILL.md index). Each section: when, how, output shape, failure modes.

## §1 Blindspot pass — for unknown unknowns

**When:** the user is entering territory they can't yet evaluate — a new part of the
codebase, a new domain (color grading, auth flows, DB migrations), or they explicitly
say "뭘 모르는지도 모르겠어".

**How:**
1. Establish their starting point in one line if unclear ("이 영역 처음이야, 아니면
   대충 아는데 세부만 몰라?") — the depth of the pass depends on it.
2. Sweep both directions in parallel: the codebase (existing patterns, prior art,
   couplings, half-finished attempts, tests that encode intent) and the domain
   (what practitioners know that beginners don't). Use subagents for breadth.
3. Report as **"당신이 몰랐을 것들"** — not a domain textbook. Each item: what it is,
   why it changes their decisions, what they should now decide or ask. 5-9 items,
   ordered by decision impact.
4. End with: "이걸 알았으니, 원래 요청을 이렇게 고쳐 말할 수 있어: …" — a rewritten,
   sharper version of their brief. This is the actual deliverable.

**Failure modes:** lecturing about the domain instead of *their* blindspots; listing
20 items (nobody absorbs 20); skipping the rewritten-brief ending.

## §2 Variants & prototypes — for unknown knowns (taste)

**When:** the user will recognize what they want on sight but can't specify it —
visual design, UX copy, dashboard layouts, API ergonomics, report structures.

**How:**
1. Build 2-4 **genuinely divergent** options, not one idea with knob tweaks. Vary the
   axis that matters: information density, tone, layout paradigm, interaction model.
   Label each with the design intent in one line ("A: 밀도 우선 — 한 화면에 전부").
2. Cheapest medium that lets them react: single-file HTML mock with fake data for
   anything visual (render side-by-side when possible); markdown table sketches for
   API/schema shapes; 3 rewrites in place for copy. **Never wire real backend/state
   for a taste probe.**
3. Ask for reactions, not choices: "어느 쪽이 가깝고, 뭐가 거슬려?" — the objections
   to the losers are as informative as the winner.
4. Record the verdict as taste facts ("정보밀도 높은 쪽 선호, 그라데이션 싫어함") —
   these are reusable user-shaped facts; route them to memory per SKILL.md.

**Failure modes:** 4 near-identical options (fake divergence); prototyping in the real
app and contaminating the working tree; asking "which one?" without harvesting *why*.

## §3 Load-bearing interview — for known unknowns

**When:** a small number of forks exist where only the user's answer determines the
path — priorities, risk tolerance, scope boundaries, business rules.

**How:**
1. Draft candidate questions, then delete every one that fails the test: "does each
   possible answer change what I build?" Also delete anything answerable by reading
   code/docs/web yourself.
2. Sort by architectural impact — data model and irreversible choices first, cosmetics
   last (or never).
3. Ask ≤4 per round, each with concrete options and your recommendation marked. Use
   the structured-question tool if available; otherwise inline with lettered options.
   One round is the norm; two is the max before you switch to stating assumptions.
4. Feed answers back as decisions in your plan ("사용자 확정: X"), so the record shows
   which choices are theirs vs yours.

**Failure modes:** open-ended essay questions ("어떻게 생각해?"); asking about things
you could decide conservatively; drip-feeding questions across many turns.

## §4 Reference-as-spec — when description is harder than pointing

**When:** the user says "그 라이브러리처럼", "이 사이트 느낌으로", or you sense a
long spec conversation could be replaced by one existing artifact.

**How:**
1. Proactively ask for a pointer when flailing is imminent: "비슷하게 동작하는 코드나
   사이트 있어? 설명보다 그게 빨라."
2. Read the **source**, not the surface: for code, extract the semantics (edge cases,
   state transitions, defaults) — not the style; for websites, read the DOM/CSS, not a
   screenshot description. Different language is fine; semantics port, syntax doesn't.
3. Write a short extraction ("레퍼런스에서 가져올 것: 백오프 커브, 지터, 최대 재시도
   폭. 안 가져올 것: 전역 싱글턴 구조") and confirm the boundary — users usually want
   *part* of a reference, and the unstated exclusions are where mismatches hide.

**Failure modes:** imitating structure/style instead of semantics; porting 100% of a
reference when the user wanted one behavior from it.

## §5 Decision-first plan — before a big build

**When:** implementation is about to start on anything weight-2; or the user asks for
a plan another agent/model will execute later.

**How:**
1. Lead with what's most likely to need the user's correction: data model changes,
   type interfaces, UX flows, naming, anything user-visible. Bury mechanical steps at
   the bottom — the user shouldn't wade through file lists to find the one decision
   that needs their eyes.
2. For every fork, write the **decision criterion**, not just the choice: "동일하면
   통합, 1px이라도 다르면 보류" survives contact with reality; "적절히 통합" does not.
3. Include the standing sections that make plans executable without you:
   - **제1원칙** — the one property that must not break, stated falsifiably
   - **안전/위험 판정표** — what the executor may do freely vs must record-and-skip
   - **검증 게이트** — the exact commands that gate each step
   - **보류 프로토콜** — uncertainty → record in a designated file, don't improvise
4. Verify claims against the territory before writing them down: if the plan says
   "these two blocks are identical", you must have diffed them. A plan containing
   unverified assertions is a map error you're manufacturing.
5. Store it where the project stores plans (issue tracker convention, `.scratch/`,
   etc.), not in the chat scrollback.

**Failure modes:** plans that are step lists with no judgment criteria; leading with
mechanical steps; asserting facts about the code you never checked.
