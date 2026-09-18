#!/usr/bin/env python3
"""외부 스킬 폴더를 정적 스캔해 BLOCK/WARN 소견을 뽑는다.

격리 디렉터리(스크래치패드)에 받아둔 스킬을 대상으로 실행한다. 스킬 안의
코드는 절대 실행하지 않고, 파일을 읽기만 한다.

  python3 audit.py <skill-dir> [--json]

종료 코드: 0 = 차단 후보 없음, 2 = 차단 후보 있음, 1 = 실행 오류.

이 스캐너는 판정자가 아니라 "읽을 곳을 찍어주는 도구"다. BLOCK은 '차단 후보'이지
판정이 아니다 — 위험 문자열을 *설명하는* 문서에서도 걸린다(설치 안내를 인용한
디자인 문서의 `curl | sh`, 위험 플래그를 나열한 표). 반드시 해당 줄을 문맥에서
읽고 확인한 뒤 최종 판정을 내릴 것. WARN은 대부분의 CLI 래퍼 스킬(agent-browser,
gws-*, twg-jira 등)에서 정상적으로 뜬다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, asdict, field
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}

# 텍스트로 읽지 않고 그 자체로 소견을 남기는 확장자 (컴파일 산출물·아카이브)
BINARY_EXTS = {
    ".pyc", ".pyo", ".node", ".so", ".dylib", ".dll", ".exe", ".bin",
    ".wasm", ".jar", ".class", ".o", ".a",
}
ARCHIVE_EXTS = {".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".dmg", ".pkg"}

# 문서·에셋으로 흔히 쓰여 이진이어도 소견 대상이 아닌 확장자
BENIGN_BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".pdf",
    ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mp3", ".wav",
}

MAX_READ_BYTES = 2_000_000

# (id, 설명, 정규식) — 대소문자 무시
BLOCK_PATTERNS: list[tuple[str, str, str]] = [
    ("pipe-to-shell", "원격 스크립트를 받아 바로 셸로 실행",
     r"\b(curl|wget)\b[^\n|;]{0,200}\|\s*(sudo\s+)?(ba|z|k|d)?sh\b"),
    ("eval-remote", "받아온 내용을 eval/exec",
     r"\b(eval|exec)\s*\(?\s*[\"'`$(]{0,3}\s*(curl|wget|requests\.get|urlopen|fetch\()"),
    ("eval-decoded", "디코딩한 문자열을 eval/exec/Function으로 실행",
     r"(eval|exec|new\s+Function)\s*\(\s*(atob|Buffer\.from|base64\.b64decode|b64decode)"),
    ("base64-decode", "base64 디코딩 호출",
     r"\b(base64\s+(-d|--decode|-D)|atob\s*\(|b64decode\s*\(|Buffer\.from\([^)]*['\"]base64)"),
    ("base64-blob", "본문에 박힌 긴 base64 덩어리",
     r"[A-Za-z0-9+/]{240,}={0,2}"),
    ("reverse-shell", "역방향 셸·원시 소켓",
     r"(/dev/tcp/|\bnc\s+(-[a-z]*e|-lvp)|\bncat\b|\bsocat\b\s+.*exec)"),
    ("credential-path", "자격증명·비밀 파일 경로 접근",
     r"(~/\.ssh|\bid_rsa\b|\bid_ed25519\b|~/\.aws/credentials|\.git-credentials|"
     r"~/\.npmrc|~/\.docker/config\.json|~/\.claude\.json|~/\.config/gcloud|"
     r"security\s+find-(generic|internet)-password|\bkeychain\b)"),
    ("dotenv-read", "프로젝트 .env 파일을 읽어 어딘가로 보냄",
     r"\.env\b[^\n]{0,120}\b(curl|fetch|post|upload|send|requests\.)"),
    ("persistence", "셸 rc·크론·런치에이전트·git hook 등 상시 실행 지점 수정",
     r"(>>?\s*~?/?\.?(zshrc|bashrc|bash_profile|profile)|\bcrontab\s+-|"
     r"\blaunchctl\s+(load|bootstrap)|LaunchAgents|\.git/hooks/)"),
    ("settings-write", "에이전트 설정·권한 파일 수정",
     r"(~/\.claude/settings|\.claude/settings(\.local)?\.json|allowedTools|"
     r"dangerously-skip-permissions|--dangerously)"),
    ("history-exfil", "셸 히스토리·브라우저 프로필 수집",
     r"(\.(zsh|bash)_history|Library/Application Support/(Google/Chrome|Firefox)/)"),
]

WARN_PATTERNS: list[tuple[str, str, str]] = [
    ("network", "네트워크 호출", r"\b(curl|wget|fetch\(|requests\.(get|post)|urlopen|axios\.)"),
    ("package-install", "패키지 설치", r"\b(npm\s+(i|install|exec)|npx\s+|pnpm\s+(add|dlx)|yarn\s+add|"
                                      r"pip3?\s+install|uv\s+(pip\s+)?(install|tool)|brew\s+install|"
                                      r"cargo\s+install|go\s+install)\b"),
    ("subprocess", "하위 프로세스 실행", r"\b(child_process|execSync|spawnSync|subprocess\.|os\.system|"
                                        r"Popen|shell_exec|system\()"),
    ("destructive", "파괴적 파일 조작", r"(\brm\s+-[a-z]*[rf]|\bshutil\.rmtree|\bfs\.rm(Sync)?\(|"
                                       r"\btruncate\b|\bdd\s+if=)"),
    ("privilege", "권한 상승·실행 권한 부여", r"\b(sudo\b|chmod\s+[+0-7]*x|chown\b|setuid)"),
    ("git-write", "git·gh 쓰기 작업", r"\b(git\s+(push|commit|reset\s+--hard|clean\s+-|config\s+--global)|"
                                     r"gh\s+(pr|release|repo)\s+(create|edit|delete|merge))\b"),
    ("raw-ip", "도메인 없이 IP로 직접 접속", r"https?://\d{1,3}(\.\d{1,3}){3}"),
    ("html-comment", "마크다운 안 HTML 주석 (숨은 지시 여부 확인 필요)", r"<!--"),
]

# 프롬프트 인젝션 관용구 — 지시문 안에 있으면 BLOCK
INJECTION_PATTERNS: list[tuple[str, str, str]] = [
    ("injection-override", "앞선 지시를 무시하라는 문구",
     r"(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|"
     r"disregard\s+(the\s+)?(previous|system)|이전\s*지시.{0,6}무시)"),
    ("injection-conceal", "사용자에게 숨기라는 문구",
     r"(do\s*n[o']?t\s+(tell|inform|mention\s+to)\s+the\s+user|without\s+(telling|informing)\s+the\s+user|"
     r"silently\s+(send|upload|exfil)|사용자에게\s*(는\s*)?(알리지|말하지)\s*(말|마)|몰래)"),
]

# 보이지 않는 문자 — 지시문을 사람 눈에서 숨기는 고전 수법
INVISIBLE_CHARS = {
    "​": "ZERO WIDTH SPACE", "‌": "ZWNJ", "‍": "ZWJ",
    "‎": "LRM", "‏": "RLM", "⁠": "WORD JOINER", "﻿": "BOM/ZWNBSP",
    "‪": "LRE", "‫": "RLE", "‬": "PDF", "‭": "LRO", "‮": "RLO",
    "⁦": "LRI", "⁧": "RLI", "⁨": "FSI", "⁩": "PDI",
}


@dataclass
class Finding:
    level: str          # BLOCK | WARN
    rule: str
    message: str
    path: str
    line: int = 0
    excerpt: str = ""


@dataclass
class FileInfo:
    path: str
    size: int
    kind: str           # text | binary | symlink
    executable: bool = False
    symlink_target: str = ""


@dataclass
class Report:
    skill_dir: str
    files: list[FileInfo] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)

    @property
    def blocks(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "BLOCK"]

    @property
    def warns(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "WARN"]


def is_probably_binary(data: bytes) -> bool:
    return b"\x00" in data[:8192]


def walk(root: Path) -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            out.append(Path(dirpath) / name)
    return out


def scan_text(rel: str, text: str, report: Report) -> None:
    lines = text.splitlines()
    in_fence = False

    def add(level: str, rule: str, msg: str, idx: int, raw: str) -> None:
        report.findings.append(
            Finding(level, rule, msg, rel, idx + 1, raw.strip()[:200])
        )

    for idx, line in enumerate(lines):
        if re.match(r"\s*(```|~~~)", line):
            in_fence = not in_fence


        for rule, msg, pattern in BLOCK_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                add("BLOCK", rule, msg, idx, line)
        for rule, msg, pattern in INJECTION_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                add("BLOCK", rule, msg, idx, line)
        for rule, msg, pattern in WARN_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                add("WARN", rule, msg, idx, line)

        for ch, name in INVISIBLE_CHARS.items():
            if ch not in line:
                continue
            # 코드 펜스 안의 보이지 않는 문자는 중첩 펜스 이스케이프 같은 정당한
            # 용도가 있다. 지시문(산문) 안에 있을 때가 진짜 위험 신호다.
            if in_fence:
                add("WARN", "invisible-char-in-code",
                    f"코드 블록 안 보이지 않는 문자 {name} (U+{ord(ch):04X})", idx, line)
            else:
                add("BLOCK", "invisible-char",
                    f"보이지 않는 문자 {name} (U+{ord(ch):04X}) — 숨은 지시 의심", idx, line)

    for match in re.finditer(r"https?://[^\s\)\]\"'>`]+", text):
        url = match.group(0).rstrip(".,;")
        if url not in report.urls:
            report.urls.append(url)


def audit(root: Path) -> Report:
    report = Report(skill_dir=str(root))

    for path in walk(root):
        rel = str(path.relative_to(root))
        ext = path.suffix.lower()

        if path.is_symlink():
            target = os.readlink(path)
            resolved = (path.parent / target).resolve()
            report.files.append(FileInfo(rel, 0, "symlink", symlink_target=target))
            try:
                resolved.relative_to(root.resolve())
            except ValueError:
                report.findings.append(Finding(
                    "BLOCK", "symlink-escape",
                    f"스킬 폴더 밖을 가리키는 심링크 → {target}", rel))
            continue

        try:
            size = path.stat().st_size
            data = path.read_bytes()[:MAX_READ_BYTES]
        except OSError as exc:
            # 읽을 수 없는 파일은 "소견 없음"이 아니라 "검증 불가"다. 검증하지 못한
            # 파일을 통과시키면 감사 자체가 무의미해진다.
            report.findings.append(Finding(
                "BLOCK", "unreadable", f"읽을 수 없어 검증 불가: {exc}", rel))
            continue

        if size > MAX_READ_BYTES:
            report.findings.append(Finding(
                "BLOCK", "oversized",
                f"{size:,}B — 앞 {MAX_READ_BYTES:,}B만 스캔됨. 나머지는 검증되지 않음", rel))

        executable = bool(path.stat().st_mode & 0o111)
        binary = ext in BINARY_EXTS or ext in ARCHIVE_EXTS or is_probably_binary(data)
        report.files.append(FileInfo(rel, size, "binary" if binary else "text", executable))

        if ext in BINARY_EXTS:
            report.findings.append(Finding(
                "BLOCK", "compiled-binary",
                "컴파일된 바이너리 — 소스에서 검증할 수 없음", rel))
            continue
        if ext in ARCHIVE_EXTS:
            report.findings.append(Finding(
                "BLOCK", "archive",
                "압축 파일 — 내용을 검증할 수 없음. 풀어서 커밋하거나 제외할 것", rel))
            continue
        if binary:
            if ext not in BENIGN_BINARY_EXTS:
                report.findings.append(Finding(
                    "BLOCK", "opaque-binary",
                    "확장자로 설명되지 않는 이진 파일", rel))
            continue

        if executable:
            report.findings.append(Finding(
                "WARN", "exec-bit", "실행 권한이 붙은 파일 — 무엇을 하는지 본문에서 확인", rel))

        scan_text(rel, data.decode("utf-8", errors="replace"), report)

    return report


def render(report: Report) -> str:
    out: list[str] = []
    out.append(f"# 정적 스캔: {report.skill_dir}")
    out.append("")
    out.append(f"## 파일 인벤토리 ({len(report.files)}개)")
    for f in report.files:
        flags = []
        if f.executable:
            flags.append("exec")
        if f.kind != "text":
            flags.append(f.kind)
        if f.symlink_target:
            flags.append(f"→ {f.symlink_target}")
        suffix = f"  [{', '.join(flags)}]" if flags else ""
        out.append(f"- {f.path} ({f.size:,}B){suffix}")

    for level, title in (("BLOCK", "차단 후보"), ("WARN", "확인 필요")):
        items = report.blocks if level == "BLOCK" else report.warns
        out.append("")
        out.append(f"## {title} ({len(items)}건)")
        if not items:
            out.append("- 없음")
        for f in items:
            where = f"{f.path}:{f.line}" if f.line else f.path
            out.append(f"- [{f.rule}] {where} — {f.message}")
            if f.excerpt:
                out.append(f"      {f.excerpt}")

    out.append("")
    out.append(f"## 등장 URL ({len(report.urls)}개)")
    for url in report.urls or ["없음"]:
        out.append(f"- {url}")

    out.append("")
    out.append(
        "이 출력은 판정이 아니다. 차단 후보는 해당 줄을 문맥에서 읽어 "
        "실제 공격 코드인지, 위험 문자열을 설명하는 문서인지 확인할 것. "
        "확인 필요 항목은 스킬이 표방한 목적에 비춰 타당한지 판단할 것."
    )
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skill_dir")
    parser.add_argument("--json", action="store_true", help="기계 판독용 JSON으로 출력")
    args = parser.parse_args()

    root = Path(args.skill_dir).expanduser()
    if not root.is_dir():
        print(f"디렉터리가 아님: {root}", file=sys.stderr)
        return 1

    report = audit(root)

    if args.json:
        print(json.dumps({
            "skill_dir": report.skill_dir,
            "files": [asdict(f) for f in report.files],
            "findings": [asdict(f) for f in report.findings],
            "urls": report.urls,
            "block_count": len(report.blocks),
            "warn_count": len(report.warns),
        }, ensure_ascii=False, indent=2))
    else:
        print(render(report))

    return 2 if report.blocks else 0


if __name__ == "__main__":
    sys.exit(main())
