#!/usr/bin/env python3
"""
자존노트 데이터를 Claude AI에게 분석 요청할 수 있는 프롬프트를 생성합니다.
실행하면 클립보드에 복사 가능한 텍스트를 출력합니다.
"""

import configparser
import re
import sys
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent


def load_config() -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    cfg.read(SCRIPT_DIR / "config.ini", encoding="utf-8")
    return cfg


def find_vault(hint: str) -> Path:
    if hint:
        p = Path(hint)
        if p.exists():
            return p
    for root in [
        Path.home() / "Documents",
        Path.home() / "OneDrive" / "Documents",
        Path.home() / "OneDrive",
        Path.home(),
    ]:
        if not root.exists():
            continue
        for obsidian_dir in root.rglob(".obsidian"):
            return obsidian_dir.parent
    print("[ERROR] 볼트를 찾을 수 없습니다.")
    sys.exit(1)


def extract_esteem_entries(target_path: Path, section: str) -> list[tuple[str, list[str]]]:
    """하루자존 섹션에서 날짜별 항목을 파싱합니다."""
    text = target_path.read_text(encoding="utf-8")
    in_section = False
    entries = []
    current_date = None
    current_items = []

    date_pattern = re.compile(r"^\d{4}[.\-]\d{2}[.\-]\d{2}$")

    for line in text.split("\n"):
        if re.match(rf"^#{1,6}\s+{re.escape(section)}\s*$", line):
            in_section = True
            continue
        if in_section and re.match(r"^#{1,6}\s+", line):
            break
        if not in_section:
            continue

        stripped = line.strip()
        if date_pattern.match(stripped):
            if current_date and current_items:
                entries.append((current_date, current_items))
            current_date = stripped
            current_items = []
        elif stripped.startswith("- ") and current_date:
            current_items.append(stripped[2:])

    if current_date and current_items:
        entries.append((current_date, current_items))

    return entries


def build_prompt(entries: list[tuple[str, list[str]]], mode: str) -> str:
    all_items = []
    for date, items in entries:
        for item in items:
            all_items.append(f"- {date}: {item}")

    data_block = "\n".join(all_items)
    total = len(all_items)
    period = f"{entries[0][0]} ~ {entries[-1][0]}" if entries else ""

    if mode == "strength":
        return f"""아래는 내가 매일 기록한 자존노트입니다. ({period}, 총 {total}개 항목)
각 항목은 그날 내가 잘했다고 느낀 일들입니다.

{data_block}

위 데이터를 분석해서 다음을 알려줘:
1. 내가 자주 잘하는 영역(강점) 상위 5가지와 근거 예시
2. 내가 자존감을 느끼는 구체적인 상황 패턴
3. 나를 한 문장으로 정의한다면?"""

    elif mode == "monthly":
        return f"""아래는 내가 매일 기록한 자존노트입니다. ({period}, 총 {total}개 항목)

{data_block}

이번 기간 동안 내가 잘한 것들을 월별로 요약해줘.
각 월의 하이라이트 3가지와, 전체를 관통하는 성장 흐름도 알려줘."""

    else:
        return f"""아래는 내가 매일 기록한 자존노트입니다. ({period}, 총 {total}개 항목)

{data_block}

이 데이터로 나에 대해 파악할 수 있는 핵심 인사이트를 뽑아줘."""


def main():
    cfg = load_config()
    obs = cfg["obsidian"]
    notes = cfg["notes"]

    vault = find_vault(obs.get("vault_path", "").strip())
    target_name = notes.get("target_note", "자존노트.md").strip()
    target_section = notes.get("target_section", "하루자존").strip()

    target_path = next(vault.rglob(target_name), None)
    if not target_path:
        print(f"[ERROR] '{target_name}' 파일을 찾을 수 없습니다.")
        sys.exit(1)

    entries = extract_esteem_entries(target_path, target_section)
    if not entries:
        print("[INFO] 하루자존 섹션에 데이터가 없습니다.")
        sys.exit(0)

    print(f"\n총 {len(entries)}일, {sum(len(i) for _, i in entries)}개 항목 감지됨")
    print("\n분석 유형을 선택하세요:")
    print("  1. 강점 패턴 분석 (내가 잘하는 것 찾기)")
    print("  2. 월별 성장 요약")
    print("  3. 전체 인사이트")
    choice = input("\n번호 입력 (기본값 1): ").strip() or "1"

    mode_map = {"1": "strength", "2": "monthly", "3": "general"}
    mode = mode_map.get(choice, "strength")

    prompt = build_prompt(entries, mode)

    output_path = SCRIPT_DIR / "insight_prompt.txt"
    output_path.write_text(prompt, encoding="utf-8")

    print(f"\n[OK] 프롬프트가 저장됐습니다: {output_path}")
    print("     이 파일을 열어서 Claude에게 복붙하세요.\n")
    print("=" * 60)
    print(prompt[:500] + "..." if len(prompt) > 500 else prompt)
    print("=" * 60)


if __name__ == "__main__":
    main()
