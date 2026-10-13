# HTML 투어 형식

`tour-template.html`을 출력 폴더에 `tour.html`로 복사하고 **두 곳만** 채운다:

1. `<title>` 텍스트
2. `<script id="tour-data" type="application/json">` 안의 JSON

버튼·방향키·진행 표시·목차·mermaid 렌더·다크 모드는 템플릿이 이미 한다. 템플릿의 CSS/JS는 고치지 않는다. 표지(제목·요약·커밋 표)는 JSON의 `title`/`summary`/`commits`에서 자동으로 만들어지므로 장면으로 넣지 않는다.

## JSON 스키마

```json
{
  "title": "작업 이름",
  "summary": "한 줄 요약",
  "audience": "청중 (선택)",
  "commits": [{ "sha": "abc1234", "subject": "커밋 제목" }],
  "scenes": [
    {
      "id": 1,
      "title": "전체 지도",
      "key": "청중이 가져갈 한 문장",
      "blocks": [
        { "type": "text", "md": "문단. **굵게**, `코드`, 줄바꿈은 \\n" },
        { "type": "list", "items": ["항목", "항목"] },
        { "type": "mermaid", "code": "flowchart LR\n  A --> B" },
        { "type": "code", "lang": "ts", "file": "src/a.ts:10-24", "label": "before", "code": "..." },
        { "type": "diff", "file": "src/a.ts", "code": "-old line\n+new line\n context line" },
        { "type": "files", "items": ["src/a.ts:10", "src/b.ts:3"] },
        { "type": "qa", "items": [{ "q": "질문", "a": "답" }] }
      ],
      "evidence": ["abc1234"],
      "note": "발표자 메모 — 화면 하단에 접힌 채로 표시 (선택)"
    }
  ]
}
```

규칙:

- `scenes`의 순서·`id`·`title`은 장면 목록과 같다.
- `text.md`는 굵게·인라인 코드·줄바꿈만 지원한다. 표·헤딩은 다른 블록 타입으로 나눈다.
- `code.code`와 `diff.code`는 15줄 이내. `diff`는 각 줄 첫 글자가 `+`/`-`/공백.
- 코드 안에 `</script>`가 있으면 `<\/script>`로 쓴다.
- mermaid 규칙은 `md-script-format.md`의 mermaid 절과 같다.

## 검증

```bash
node -e '
const s=require("fs").readFileSync("tour.html","utf8");
const m=s.match(/<script id="tour-data"[^>]*>([\s\S]*?)<\/script>/);
const d=JSON.parse(m[1]);
console.log("scenes:",d.scenes.length, d.scenes.map(x=>x.id+"."+x.title).join(" | "));
'
open tour.html
```

장면 수가 장면 목록과 같고, 브라우저에서 "다음"으로 마지막 장면까지 넘어가면 완료.
