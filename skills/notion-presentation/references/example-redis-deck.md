# Worked example: Redis singlethread deck (10 slides)

This is a reference deck demonstrating every archetype and block pattern from SKILL.md. Read it when you need a concrete model of what a "designer-grade" Notion presentation looks like end-to-end.

## Narrative arc used

| Slide | Phase | Archetype |
|---|---|---|
| 1 | Hook | Title (claim + callout teaser) |
| 2 | Problem | Question + two-column compare |
| 3 | Tension | Mechanism + Mermaid flowchart |
| 4 | Insight | Numbered breakdown via toggles |
| 5 | Body ① | Comparison (table + Mermaid) |
| 6 | Body ② | Mechanism + metaphor (two-column callouts) |
| 7 | Body ③+④ | Code / protocol |
| 8 | Body ⑤ | Mechanism + Mermaid sequence diagram |
| 9 | Nuance | Counter-argument with versioned bullets |
| 10 | Summary | Recap + checklist + final callout |

Notice the rhythm: no two adjacent slides share an archetype. Mermaid appears on slides 3, 5, 8 — spaced out, not back-to-back. Callouts appear on every slide but with different colors meaning different things (blue=insight, red=warning, green=answer, yellow=key claim, orange=practical tip).

## Full deck source

```markdown
# 싱글스레드 Redis가 수십만 QPS를 내는 아키텍처의 비밀

**발표 목적**: 멀티코어 서버 시대에 Redis가 '싱글스레드'를 선택한 의도와, 그럼에도 불구하고 압도적인 성능(수십만~수백만 QPS)을 유지하는 **5가지 구조적 비밀**을 아키텍트의 시각에서 파헤칩니다.

<callout icon="💡" color="blue_bg">
	**싱글스레드니까 느리다?** 멀티코어가 무조건 빠르다는 편견을 깨는 Redis의 설계 철학
</callout>

키워드: `Single-Threaded` · `QPS(Queries Per Second)` · `Latency < 1ms`

---

# 🤔 의문: 8코어 서버에서 코어를 하나만 쓰면 7개는 노는 것 아닌가?

<columns>
	<column>
		## 일반적인 통념
		멀티코어를 병렬로 활용해야 무조건 빠른 시스템이다? ❌
		<empty-block/>
		8코어 중 1코어만 사용 ➡️ **"비효율적이다?"**
	</column>
	<column>
		## 실제 벤치마크 성능
		**평균 응답 시간**: <span color="green">**1ms 이하**</span>
		<empty-block/>
		**파이프라인 활용 시**
		- Set: <span color="green">**153만 QPS**</span>
		- Get: <span color="green">**181만 QPS**</span>
	</column>
</columns>

<callout icon="⚠️" color="red_bg">
	Redis가 느려지는 대부분의 경우는 싱글스레드여서가 아니라, **무거운 연산(O(N))이나 너무 큰 데이터**를 조작할 때입니다.
</callout>

---

# ⚖️ 멀티스레드가 무조건 빠르지 않은 이유

- **공유 자원 경쟁 및 락(Lock) 비용**
- **컨텍스트 스위칭(Context Switching)**
- **CPU 캐시 일관성(Cache Coherence) 유지 비용**

`​``mermaid
graph TD
    A["멀티스레드 환경"] --> B("공유 자원 접근")
    B --> C["락 획득 경쟁/대기"]
    B --> D["컨텍스트 스위칭 오버헤드"]
    C --> F(("성능 선형 증가 저해"))
    D --> F
    style F fill:#ffcccc,stroke:#333,stroke-width:2px
`​``
```

(The deck continues for 10 slides total — see the actual Notion page if regenerating.)

## Why each pattern worked

- **Slide 1 callout** uses a question-as-claim ("싱글스레드니까 느리다?") instead of just stating the topic. This creates tension immediately.
- **Slide 2 columns** put conventional wisdom against real data side-by-side. The reader does the comparison instinctively.
- **Slide 3 Mermaid** uses convergence (multiple nodes → one) to visualize "all these costs add up". The styled end-node (`fill:#ffcccc`) acts as the punchline.
- **Slide 4 toggles** hide details so the slide reads as "3 reasons, expand for depth" — perfect for a live presentation where the speaker discusses what's hidden.
- **Slide 5 table** is used because there are 4 storage tiers × 3 attributes — too much for prose, just right for a table.
- **Slide 6 two-column callouts** carry the restaurant-waiter metaphor. The metaphor is the slide; the technical content sits inside the analogy.
- **Slide 10 checklist** uses `- [ ]` not `-` because unchecked boxes signal "things to do", which is exactly what the audience should leave with.

## What to copy

- The color discipline (red=warning, green=answer, blue=insight, yellow=claim, orange=tip)
- The archetype rotation (no two adjacent slides look alike)
- The use of metaphor on mechanism-heavy slides
- The Mermaid styling for emphasis (filled end-nodes act like a punctuation mark)
- The final callout that gives the audience one sentence to leave with
