---
name: notion-presentation
description: Use this skill whenever the user wants to create, design, or restructure a presentation document inside Notion — especially for Notion's presentation mode (where `---` becomes a slide break and headings become slide titles). Trigger on phrases like "노션 프레젠테이션", "프레젠테이션 모드", "노션으로 발표자료", "슬라이드 문서", "Notion presentation", "make slides in Notion", or when the user pastes a Notion URL and asks to turn it into slides. Also use when the user has a topic, outline, or technical content that needs to be converted into a polished, designer-quality Notion slide deck. The skill blends traditional presentation craft (narrative arc, rule of three, visual hierarchy, contrast, metaphor) with Notion-native blocks (callouts, columns, toggles, Mermaid, tables, inline color) so the result reads like something a senior designer or technical evangelist would produce — not a wall of bullets.
---

# Notion Presentation Builder

This skill produces **designer-grade Notion presentation documents** that work in Notion's presentation mode. The goal is not "a Notion page with headings" — it is a slide deck that survives standing on a stage, with deliberate rhythm, visual hierarchy, and a strong narrative arc.

## When to use this skill

- The user wants to turn a topic, outline, or raw content into a Notion presentation
- The user references Notion's presentation mode (`---` as slide break, headings as titles)
- The user shares a Notion URL and asks to restructure it into slides
- The user gives you an existing slide spec and asks you to "build it properly" in Notion

If the request is for a static document (report, wiki page, spec), this skill is **not** the right tool — use plain Notion markdown instead.

## Core mental model

Notion presentation mode has two non-negotiable rules:

1. **`---` (a horizontal divider) starts a new slide.**
2. **Headings (`#`, `##`, `###`) become the slide title.** Use `#` for the main title of each slide; reserve `##` / `###` for in-slide section headers.

Everything else is just Notion blocks — but the *combination* of blocks is what separates a good deck from a bad one. A great Notion slide uses 2–4 different block types arranged with intent. A bad one is a bulleted list pretending to be a slide.

## Before you start: interview the user (briefly)

If the user hasn't already provided structure, ask just enough to design well. Don't over-ask — pick 1–3 of these depending on what's missing:

- **Audience**: technical engineers? executives? mixed?
- **Length**: how many slides? (default: 8–12 if not specified)
- **Tone**: formal / conversational / technical-with-personality?
- **Format constraints**: are they presenting live, or sharing the doc async? (Live = simpler slides, async = more text OK.)
- **Existing material**: do they have an outline, or are you building from a topic?

If they already gave a detailed slide-by-slide spec (like the Redis example), skip the interview and execute.

## The narrative spine (apply to every deck)

Strong decks follow a story, not a table of contents. Map the slides to this arc:

| Phase | Purpose | Typical slides |
|---|---|---|
| **Hook** | Pull the audience in with tension, a counterintuitive claim, or a vivid number | 1 |
| **Problem / Question** | Establish *why this matters now* | 1–2 |
| **Tension / Tradeoff** | Show the conventional answer is incomplete | 1 |
| **Core insight** | The "aha" — the central thesis of the deck | 1 |
| **Body (deep dive)** | Evidence, mechanisms, examples — usually 3–5 sub-points (rule of three works) | 3–6 |
| **Nuance / Counter** | Address the "yes but…" — shows intellectual honesty | 1 |
| **Summary + action** | What to remember, what to do Monday morning | 1 |

Not every deck needs all phases, but **every deck needs Hook → Insight → Body → Summary** at minimum. If you can't identify the hook and the insight, the deck isn't ready to build.

## Slide design patterns

A slide is one of these archetypes. Mixing archetypes is what creates visual rhythm — *never* build a deck where every slide looks the same.

### 1. Title slide (Hook)
- One bold H1 with the actual claim, not "Introduction"
- One short framing paragraph (1–2 sentences)
- One callout with the *provocative* version of the thesis
- Optionally: inline-code keywords as a teaser

### 2. Question / Tension slide
- H1 phrased as a question or a contrarian statement (`🤔 의문: …` works well)
- **Two-column layout**: conventional wisdom on the left, reality/data on the right
- End with a callout that frames the actual problem

### 3. Mechanism / Diagram slide
- H1 names the mechanism
- 2–4 lines of prose explaining the *what*
- A Mermaid diagram (flowchart, sequence, or comparison)
- Optional callout for the takeaway

### 4. Comparison slide
- Either a **table** (when 3+ items, 2+ attributes) or **two-column callouts** (when comparing exactly 2 things)
- Use color coding: green for the "winning" side, red/orange for the losing side, never both neutral

### 5. Progressive disclosure slide
- H1 states the claim
- 2–4 toggles (`<details>`) — each one a sub-point with the *headline* visible and the *details* hidden
- This is great when you have a "3 reasons why X" structure and don't want to overwhelm the slide

### 6. Numbered breakdown slide ("the rule of three")
- H1 names the breakdown
- 3 sub-headers (`##`) with short prose under each
- Three is the magic number — two feels thin, four feels like a list

### 7. Code / protocol slide
- H1 names the artifact
- A short prose lead-in
- A code block (use the right language tag)
- A callout explaining what's notable about it

### 8. Summary slide
- H1 with a recap claim
- A checklist (`- [ ]`) of the things to remember / do
- One final callout with the single sentence the audience should leave with

## Notion block toolkit (when to use what)

Use the [enhanced markdown spec](notion://docs/enhanced-markdown-spec) for exact syntax. Key blocks and their best use:

- **Callout** (`<callout icon="…" color="…_bg">`): the single most important Notion block. Use 1–2 per slide to highlight the thesis, warning, or aha moment. Pick the icon and color deliberately:
  - 💡 `blue_bg` — insight, tip
  - ⚠️ `red_bg` — warning, anti-pattern
  - 🎯 `yellow_bg` / `green_bg` — key claim, summary
  - 📌 `gray_bg` — neutral note, aside
  - 🔥 `orange_bg` — practical / hot tip
- **Columns** (`<columns><column>…</column>…</columns>`): use for compare/contrast. Two columns is ideal; three only if the items are very short.
- **Toggle** (`<details><summary>…</summary>…</details>`): use when you have a punchy headline and want to keep details available without cluttering the slide.
- **Mermaid** (` ```mermaid `): use for flow, sequence, state, comparison. Always wrap node labels with special characters in double quotes (`A["Notion (App)"]`). Use `<br>` for line breaks, not `\n`.
- **Tables**: use when you have ≥3 rows and ≥2 columns of structured data. With 1–2 rows, a callout or columns reads better.
- **Inline color** (`<span color="red">…</span>`): use very sparingly — usually for a single number or word per slide. Overuse kills the effect.
- **Inline code** (`` `text` ``): use for technical keywords, command names, API names. Adds visual texture and reads as "expert".
- **Checklist** (`- [ ]`): use on summary slides for "things to remember" or "things to avoid". The unchecked-box visual reads as "action items".

## Visual rhythm rules

These are the rules that separate a designer-quality deck from a "Claude made me a slide deck" deck:

1. **No two adjacent slides should use the same archetype.** If slide 3 is a two-column comparison, slide 4 shouldn't be. Vary the visual.
2. **Every slide should have at least one non-text block** (callout, diagram, table, columns, code). A slide that is only headings + paragraphs + bullets is a weak slide.
3. **Color is signal, not decoration.** Use the same color for the same meaning across the whole deck (e.g., red_bg always = warning; green_bg always = the answer). Don't randomly color callouts.
4. **One thesis per slide.** If you can't summarize the slide in a single sentence, it's two slides.
5. **Concrete numbers beat adjectives.** "Very fast" → "<1ms p99 latency". Every body slide should have at least one concrete data point if the topic allows it.
6. **Metaphors carry mechanism slides.** The Redis epoll = restaurant waiter analogy was load-bearing in the example deck. When explaining a mechanism, reach for a vivid concrete analogy and lay it out in a two-column callout.
7. **Whitespace is created with `<empty-block/>`**, but you almost never need it. Notion spaces blocks well by default — only add empty blocks inside columns or callouts where the rhythm feels too tight.

## Working with Notion via MCP

When the user provides a Notion URL:

1. **Fetch the page first** with `mcp__notion__notion-fetch` to see current content and confirm you have the right page.
2. **Read the enhanced markdown spec** if you haven't already in this session — fetch `notion://docs/enhanced-markdown-spec` via the MCP resource tool. Don't guess Notion-flavored markdown syntax; it has subtle differences from standard markdown (e.g., `<details>` not `<summary>` alone, tab indentation, escape rules).
3. **Use `replace_content`** (via `mcp__notion__notion-update-page`) for full deck rewrites. Use `update_content` with `content_updates` for targeted slide edits.
4. **Preserve child pages**: if the page has `<page>` or `<database>` blocks you want to keep, include them in the new content. `replace_content` will refuse to delete them unless you pass `allow_deleting_content: true`.

If the user gives you content but no URL, write the markdown directly and ask where to put it.

## Output checklist (run this before you finish)

Before declaring the deck done, mentally walk through it:

- [ ] Slide 1 has a real claim, not "Introduction" or "Agenda"
- [ ] The narrative arc is identifiable (Hook → Insight → Body → Summary at minimum)
- [ ] No two adjacent slides use the same archetype
- [ ] Every slide has at least one non-text block
- [ ] Callout colors are consistent in meaning across the deck
- [ ] At least one Mermaid diagram, one table or columns layout, and one callout in the deck
- [ ] The summary slide has actionable content, not just recap
- [ ] All Mermaid node labels with parens or special chars are double-quoted
- [ ] If presentation mode is the target: `---` between every slide, `#` as every slide title

If any of these fail, fix before handing off.

## Worked example (mini)

For deeper reference patterns, see `references/example-redis-deck.md` — a complete 10-slide deck on a technical topic that demonstrates every archetype above.

## Anti-patterns to avoid

- **Wall-of-bullets slides.** If a slide is just `- item` × 6, it failed. Convert to columns, table, toggles, or split into two slides.
- **Every slide has the same callout color.** That's not signal, it's wallpaper.
- **Title slides that say "Agenda" or "Overview".** Lead with the claim.
- **Mermaid diagrams with cramped labels.** If the label is >4 words, use `<br>` or rethink the diagram.
- **Code blocks with no surrounding context.** Always sandwich code between a setup line and a callout-style takeaway.
- **Forgetting the presentation mode rules.** A document with `##` titles and no `---` dividers does not work in presentation mode. Always use `#` + `---`.
