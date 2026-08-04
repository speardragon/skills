# skills

개인 스킬 모음 저장소입니다. Claude Code 플러그인 형태로 설치할 수 있습니다.

## Overview

이곳에는 다양한 작업을 자동화하고 생산성을 높이기 위한 스킬들이 정리됩니다.

`cdragon list` 로 항상 최신 목록을 확인할 수 있습니다.

| 스킬                       | 설명                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `adhd`                     | 병렬 발산 아이디에이션 — 격리된 인지 프레임 5개로 발산 후 수렴 |
| `agent-browser`            | AI 에이전트용 브라우저 자동화 CLI                             |
| `grill-me`                 | 계획·설계를 끝까지 캐묻는 인터뷰 (`grilling` 실행용 별칭)     |
| `grilling`                 | 계획·결정을 한 번에 한 질문씩 끝까지 캐묻는 인터뷰 엔진       |
| `herdr-agent`              | herdr 안에서 새 탭·분할·워크스페이스에 코딩 에이전트를 띄움   |
| `herdr-cli`                | herdr를 내부에서 제어 (워크스페이스·탭·분할·에이전트 관리)    |
| `html`                     | 자기완결형 단일 HTML 아티팩트 생성 — 리포트·랜딩페이지 등 라우터 |
| `design-artifact`          | HTML 아티팩트용 비주얼 크리에이티브 디렉션(팔레트·타이포·레이아웃) |
| `html-wireframe`           | 저충실도 HTML 와이어프레임 — 정보구조·내비게이션·플로우 검증  |
| `html-prototype`           | 인터랙티브 HTML 목업·프로토타입                               |
| `html-diagram`             | 아키텍처·시퀀스·상태 등 HTML 다이어그램                       |
| `html-plan`                | 원본 내용을 보존한 HTML 플랜·로드맵 문서                      |
| `i-have-adhd`              | ADHD 독자용 출력 형식 — 다음 행동 우선, 번호 매기기, 군더더기 제거 |
| `notion-presentation`      | 콘텐츠를 Notion 프레젠테이션 모드용 슬라이드 문서로 구성      |
| `setup-matt-pocock-skills` | 엔지니어링 스킬용 이슈 트래커·트리아지 설정                   |
| `tdd`                      | red-green-refactor 기반 테스트 주도 개발                      |
| `to-html`                  | 콘텐츠를 브랜드 디자인이 적용된 단일 HTML 파일로 렌더링       |
| `to-tickets`               | 계획·스펙·대화를 blocking 관계가 있는 티켓으로 분해           |
| `to-spec`                  | 현재 대화를 스펙으로 정리해 이슈 트래커에 발행                |
| `unknowns`                 | 작업 착수 전 map/territory 갭(모르는 것)을 구조적으로 발견    |
| `writing-great-skills`     | 스킬을 예측 가능하게 작성·편집하기 위한 원칙·어휘 레퍼런스     |

## Install (Claude Code plugin)

마켓플레이스로 등록한 뒤 플러그인을 설치합니다.

```text
/plugin marketplace add speardragon/skills
/plugin install speardragon-skills@speardragon-skills
```

로컬 경로로 등록할 수도 있습니다.

```text
/plugin marketplace add /path/to/skills
```

## Install (vercel `skills` CLI)

이 레포는 [vercel `skills` CLI](https://github.com/vercel-labs/agent-skills)의 소스 레포로도 바로 쓸 수 있습니다. 모든 스킬이 `skills/<name>/SKILL.md` 구조라, CLI가 자동으로 목록을 찾아 설치합니다. 별도 설정 파일은 필요하지 않습니다.

```bash
npx skills add speardragon/skills             # 목록에서 골라 설치
npx skills add speardragon/skills/saju        # 특정 스킬만 설치
```

설치된 스킬의 출처와 해시는 사용하는 쪽 프로젝트의 `skills-lock.json`에 기록됩니다. (참고: 이 레포 자체의 `skills-lock.json`은 반대로, 여기서 가져온 외부 스킬들의 출처를 기록한 것입니다.)

## `cdragon` CLI

이 레포의 스킬을 원하는 위치의 `.claude/skills`·`.agents/skills`·`.gemini/skills` 에 **심링크**로 연결하는 CLI입니다. 플러그인 설치 대신 로컬 디렉터리에 바로 붙이고 싶을 때 사용합니다.

### 설치

편한 방법을 고르세요. (모두 Node.js ≥18 필요)

**npx (권장, 설치 불필요)**

```bash
npx cdragon@latest
```

**npm**

```bash
npm i -g cdragon
```

**curl**

```bash
curl -fsSL https://raw.githubusercontent.com/speardragon/skills/main/install.sh | bash
# ~/.cdragon 에 clone 후 cdragon 명령을 PATH에 등록. 재실행하면 업데이트됩니다.
```

**직접 clone (개발용)**

```bash
git clone https://github.com/speardragon/skills.git
cd skills
npm link        # cdragon 명령을 전역 PATH에 등록
```

### 사용

```bash
cdragon                     # 대화형: scope(project/global) → 폴더(.claude/.agents/.gemini) → 스킬 선택
cdragon status              # 스킬별 설치 현황 매트릭스 (global/project × .claude/.agents/.gemini)
cdragon unlink [skills...]  # 스킬 심링크 제거 (이 레포를 가리키는 것만)
cdragon prune               # 레포에서 사라진 스킬의 고아 링크 정리
cdragon list                # 사용 가능한 스킬 목록 보기
cdragon help                # 도움말
```

> 스킬 이름이 `status`·`st`·`unlink`·`rm`·`prune`·`list`·`ls`·`help`·`link` 등 예약어(별칭 포함)와 겹치면 `cdragon link <이름>`으로 명시적으로 링크하세요.

대화형 스킬 선택 화면과 실행 전 요약에는 타겟 폴더별 상태가 표시됩니다 — `✓ 연결됨 · — 없음 · ! 실제 폴더 · ↻ 끊긴 링크`. 예를 들어 `.claude`에만 연결돼 있던 스킬을 `--all-targets`로 실행하면 `.claude = already / .agents + link`처럼 어디가 이미 설치됐고 어디에 새로 연결되는지 한눈에 보입니다.

> **Antigravity**는 global은 `~/.gemini/skills`, project는 `.agents/skills`를 읽습니다. 그래서 `--gemini`는 **global 전용**이고, 프로젝트 단위 Antigravity는 `--agents`로 커버됩니다. `.gemini`는 project scope의 picker·status 매트릭스에 나타나지 않으며, `--gemini --project`는 경고 후 건너뜁니다.

대화형 화살표 UI 대신 플래그로 비대화형 실행도 가능합니다.

```bash
cdragon --project --claude --all -y         # 현재 폴더의 .claude/skills 에 전부 연결
cdragon --global --all-targets tdd grill-me # ~/.claude, ~/.agents, ~/.gemini 전부에 일부만 연결
```

| 플래그                                        | 의미                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| `-p, --project`                               | 현재 디렉터리에 연결                                     |
| `-g, --global`                                | 홈 디렉터리(`~/.claude`, `~/.agents`, `~/.gemini`)에 연결 |
| `--claude` / `--agents` / `--gemini`          | 대상 폴더 선택 (`--gemini`는 global 전용)                |
| `--all-targets`                               | 해당 scope에서 유효한 폴더 전부                          |
| `-a, --all`                                   | 모든 스킬 연결                                           |
| `--skills a,b,c`                   | 특정 스킬만 연결                             |
| `-y, --yes`                        | 확인 프롬프트 건너뛰기                       |
| `-f, --force`                      | 자리를 차지한 실제 폴더를 심링크로 교체      |
| `--offline`                        | 스킬 미러 갱신 없이 로컬에 있는 내용만 사용  |
| `--refresh`                        | 갱신 주기(1시간)를 무시하고 즉시 미러 갱신   |

같은 대상을 가리키는 심링크는 그대로 두고, 다른 곳을 가리키면 다시 연결합니다. 이미 존재하는 **실제 디렉터리**(예전에 복사 방식으로 설치된 스킬)는 기본적으로 건너뛰지만, 대화형에서는 교체 여부를 물어보고 `--force`를 주면 바로 교체합니다. 교체 시 원본 폴더는 삭제하지 않고 같은 위치의 `skills-backup/`으로 옮겨둡니다.

`unlink`은 이 레포를 가리키는 심링크만 지웁니다 — 실제 폴더나 다른 곳을 가리키는 링크는 건드리지 않습니다. `prune`은 레포에서 삭제·개명된 스킬의 깨진 링크만 정리합니다. `cdragon status`는 그런 고아 링크를 하단에 표시합니다.

### 스킬 최신화

`npm i -g`로 설치하면 배포 시점의 스킬만 번들되어 있어, 갱신을 잊으면 오래된 스킬을 계속 연결하게 됩니다. 이를 피하려고 `cdragon`은 실행 위치에 따라 스킬을 다르게 찾습니다.

- **git checkout에서 실행 중** (이 레포 자체를 `npm link`했거나, curl 설치로 만들어진 `~/.cdragon`): 옆에 있는 `skills/`를 그대로 사용합니다. 최신화는 본인이 직접 관리합니다 (로컬 수정, 또는 `git pull` / 재설치).
- **npm/npx로 설치되어 실행 중**: `~/.cdragon-mirror`에 이 레포를 자체적으로 clone해두고, 1시간에 한 번씩 백그라운드로 `git pull`해 최신 상태를 유지합니다. 심링크는 이 미러를 가리키므로, `cdragon` 패키지 버전을 안 올려도 스킬 내용 자체는 계속 최신을 유지합니다. git이 없거나 오프라인이면 조용히 실패하고 npm 패키지에 번들된 스킬로 폴백합니다.

즉 `npx cdragon@latest`든 오래된 `npm i -g cdragon`이든, 스킬 신선도는 동일하게 보장됩니다. npx 쪽이 CLI 코드 자체도 매번 최신으로 받아온다는 차이만 있습니다.

### 개발

레포 루트에서 한 번 `npm link` 해두면, 이후 코드 수정은 재링크 없이 바로 반영됩니다.

```bash
npm link        # 최초 1회
```

### 배포

스킬을 추가했거나 CLI를 수정했다면 버전을 올려 다시 배포합니다. **버전을 올리지 않으면 `npm publish`가 거부됩니다** (같은 버전 재배포 불가).

```bash
npm version patch          # 0.1.0 → 0.1.1 (버그픽스) — 커밋+태그 자동 생성
# npm version minor        # 0.1.0 → 0.2.0 (기능 추가)
git push --follow-tags     # 커밋과 태그를 함께 푸시
npm publish --access public  # 게시 (보안키/OTP 인증)
```

`npm version`이 `package.json` 버전 변경·커밋·git 태그를 한 번에 처리합니다. 사용자는 `npm i -g cdragon@latest`로 갱신합니다.

## Getting Started

```bash
git clone https://github.com/speardragon/skills.git
cd skills
```

## Credits

- `grill-me`, `to-tickets`, `to-spec`, `tdd`, `setup-matt-pocock-skills`, `writing-great-skills` — [mattpocock/skills](https://github.com/mattpocock/skills) (MIT)
- `agent-browser` — [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
- `i-have-adhd` — [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) (MIT)
- `adhd` — [UditAkhourii/adhd](https://github.com/UditAkhourii/adhd) (MIT)
- `html`, `design-artifact`, `html-wireframe`, `html-prototype`, `html-diagram`, `html-plan` — [plannotator/effective-html](https://github.com/plannotator/effective-html) (MIT)

스킬은 [vercel `skills` CLI](https://github.com/vercel-labs/agent-skills)로 관리되며, 출처는 `skills-lock.json`에 기록됩니다.

## License

MIT
