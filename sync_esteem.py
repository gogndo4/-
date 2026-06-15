#!/usr/bin/env python3
"""
Obsidian 데일리노트 자존노트 → 0.나 하루자존 자동 동기화 스크립트
매일 오전 5시에 전날 자존노트 항목을 0.나 노트의 하루자존 섹션에 추가합니다.
"""

import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ─── 설정 (본인 환경에 맞게 수정) ──────────────────────────────
VAULT_PATH = Path(r"C:\Users\사용자이름\Documents\Obsidian\볼트이름")
DAILY_NOTES_FOLDER = "Daily"        # 데일리노트 폴더명
DAILY_NOTE_FORMAT = "%Y-%m-%d"      # 데일리노트 파일명 형식 (YYYY-MM-DD)
ESTEEM_HEADING = "자존노트"          # 데일리노트 자존노트 헤딩 (## 제외)
TARGET_NOTE_NAME = "0.나.md"        # 대상 노트 파일명
TARGET_SECTION = "하루자존"          # 대상 노트 섹션 헤딩 (## 제외)
# ───────────────────────────────────────────────────────────────


def find_daily_note(date: datetime) -> Path | None:
    date_str = date.strftime(DAILY_NOTE_FORMAT)
    candidates = [
        VAULT_PATH / DAILY_NOTES_FOLDER / f"{date_str}.md",
        VAULT_PATH / f"{date_str}.md",
    ]
    for path in candidates:
        if path.exists():
            return path
    # 볼트 전체에서 재귀 검색 (폴더 구조가 다를 경우)
    for path in VAULT_PATH.rglob(f"{date_str}.md"):
        return path
    return None


def extract_esteem_items(note_path: Path) -> list[str]:
    """데일리노트에서 자존노트 섹션 항목을 추출합니다."""
    text = note_path.read_text(encoding="utf-8")
    in_section = False
    items = []

    for line in text.split("\n"):
        # 자존노트 헤딩 감지 (# 개수 무관)
        if re.match(rf"^#{1,6}\s+{re.escape(ESTEEM_HEADING)}\s*$", line):
            in_section = True
            continue
        # 다음 헤딩 만나면 섹션 종료
        if in_section and re.match(r"^#{1,6}\s+", line):
            break
        # 내용 있는 줄 수집
        if in_section and line.strip():
            content = re.sub(r"^[-*]\s+", "", line.strip())
            if content:
                items.append(content)

    return items


def find_target_note() -> Path | None:
    """볼트에서 0.나 노트를 찾습니다."""
    for path in VAULT_PATH.rglob(TARGET_NOTE_NAME):
        return path
    return None


def append_to_esteem_section(items: list[str], date: datetime, target_path: Path):
    """0.나 노트의 하루자존 섹션 맨 위에 날짜별 항목을 추가합니다."""
    text = target_path.read_text(encoding="utf-8")
    date_str = date.strftime(DAILY_NOTE_FORMAT)

    # 중복 방지: 해당 날짜가 이미 기록된 경우 스킵
    if date_str in text:
        print(f"[SKIP] {date_str} 날짜가 이미 0.나 노트에 존재합니다.")
        return

    new_lines = "\n".join(f"- {date_str} - {item}" for item in items)

    lines = text.split("\n")
    insert_idx = None

    for i, line in enumerate(lines):
        if re.match(rf"^#{1,6}\s+{re.escape(TARGET_SECTION)}\s*$", line):
            # 헤딩 다음 빈 줄 건너뛰고 첫 내용 위치 찾기
            insert_idx = i + 1
            while insert_idx < len(lines) and lines[insert_idx].strip() == "":
                insert_idx += 1
            break

    if insert_idx is None:
        # 하루자존 섹션이 없으면 파일 끝에 새로 생성
        text = text.rstrip() + f"\n\n## {TARGET_SECTION}\n{new_lines}\n"
    else:
        lines.insert(insert_idx, new_lines)
        text = "\n".join(lines)

    target_path.write_text(text, encoding="utf-8")
    print(f"[OK] {date_str} 자존노트 {len(items)}개 항목 추가 완료")
    for item in items:
        print(f"  - {date_str} - {item}")


def main():
    yesterday = datetime.now() - timedelta(days=1)
    date_str = yesterday.strftime(DAILY_NOTE_FORMAT)

    daily_note = find_daily_note(yesterday)
    if not daily_note:
        print(f"[WARN] {date_str}.md 데일리노트를 찾을 수 없습니다.")
        sys.exit(0)

    items = extract_esteem_items(daily_note)
    if not items:
        print(f"[INFO] {date_str} 자존노트에 기록된 내용이 없습니다.")
        sys.exit(0)

    target_path = find_target_note()
    if not target_path:
        print(f"[ERROR] '{TARGET_NOTE_NAME}' 파일을 볼트에서 찾을 수 없습니다.")
        sys.exit(1)

    append_to_esteem_section(items, yesterday, target_path)


if __name__ == "__main__":
    main()
