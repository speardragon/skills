#!/usr/bin/env python3
"""skills-lock.json 에 스킬 항목을 추가하거나 갱신한다.

  python3 lock_add.py <name> --source <owner/repo> --skill-path <upstream/path/SKILL.md> \
      --hash <sha256> [--source-type github] [--lock skills-lock.json] [--dry-run]

키는 알파벳 순으로 유지되고, 파일은 기존과 같은 2-space JSON + 끝 개행으로
다시 쓴다(현재 파일이 json.dumps(indent=2) 와 바이트 단위로 일치함을 확인).

--source 는 업스트림 레포(owner/repo), --skill-path 는 **업스트림 레포 안의**
SKILL.md 경로다. 이 레포에 벤더링된 위치(skills/<name>/SKILL.md)가 아니라,
원본에서의 경로를 적는 것이 기존 항목들의 규칙이다.
예: mattpocock/skills 의 domain-modeling → skills/engineering/domain-modeling/SKILL.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name")
    parser.add_argument("--source", required=True, help="업스트림 레포 (owner/repo)")
    parser.add_argument("--skill-path", required=True, help="업스트림 레포 안의 SKILL.md 경로")
    parser.add_argument("--hash", required=True, help="hash.mjs 로 계산한 computedHash")
    parser.add_argument("--source-type", default="github")
    parser.add_argument("--lock", default="skills-lock.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    lock_path = Path(args.lock)
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"lock 파일을 읽을 수 없음 ({lock_path}): {exc}", file=sys.stderr)
        return 1

    if len(args.hash) != 64 or not all(c in "0123456789abcdef" for c in args.hash):
        print(f"computedHash 형식이 아님: {args.hash}", file=sys.stderr)
        return 1

    skills = lock.setdefault("skills", {})
    existed = args.name in skills
    skills[args.name] = {
        "source": args.source,
        "sourceType": args.source_type,
        "skillPath": args.skill_path,
        "computedHash": args.hash,
    }
    lock["skills"] = {k: skills[k] for k in sorted(skills)}

    text = json.dumps(lock, indent=2, ensure_ascii=False) + "\n"
    if args.dry_run:
        print(text, end="")
    else:
        lock_path.write_text(text, encoding="utf-8")

    print(
        f"{'갱신' if existed else '추가'}: {args.name} ({args.source}) → {lock_path}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
