#!/usr/bin/env python3
"""
과거 데일리노트 자존노트 항목을 일괄 이전하는 백필 스크립트
처음 한 번만 실행하세요. 이미 있는 날짜는 자동으로 스킵됩니다.
"""

import configparser
import re
import sys
import logging
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOG_FILE = SCRIPT_DIR / "backfill_esteem.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)


def load_config() -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    cfg_path = SCRIPT_DIR / "config.ini"
    cfg.read(cfg_path, encoding="utf-8")
    return cfg


def find_vault(hint: str) -> Path:
    if hint:
        p = Path(hint)
        if p.exists():
            return p
        log.error("vault_path 경로가 존재하지 않습니다: %s", hint)
        sys.exit(1)
    for root in [
        Path.home() / "Documents",
        Path.home() / "OneDrive" / "Documents",
        Path.home() / "OneDrive",
        Path.home(),
    ]:
        if not root.exists():
            continue
        for obsidian_dir in root.rglob(".obsidian"):
            vault = obsidian_dir.parent
            log.info("볼트 자동 감지: %s", vault)
            return vault
    log.error("볼트를 찾지 못했습니다. config.ini 의 vault_path 를 직접 입력해주세요.")
    sys.exit(1)


def parse_date_from_filename(filename: str, fmt: str) -> datetime | None:
    try:
        return datetime.strptime(filename, fmt)
    except ValueError:
        return None


def extract_section_items(note_path: Path, heading: str) -> list[str]:
    text = note_path.read_text(encoding="utf-8")
    in_section = False
    items = []
    for line in text.split("\n"):
        if re.match(rf"^#{1,6}\s+{re.escape(heading)}\s*$", line):
            in_section = True
            continue
        if in_section and re.match(r"^#{1,6}\s+", line):
            break
        if in_section and line.strip():
            content = re.sub(r"^[-*]\s+", "", line.strip())
            if content:
                items.append(content)
    return items


def make_block(display_date: str, items: list[str]) -> str:
    bullet_lines = "\n".join(f"- {item}" for item in items)
    return f"{display_date}\n\n{bullet_lines}\n"


def append_to_target(
    display_date: str, items: list[str], target_path: Path, section: str, existing_dates: set
) -> bool:
    if display_date in existing_dates:
        log.info("[SKIP] %s 이미 존재", display_date)
        return False

    text = target_path.read_text(encoding="utf-8")
    new_block = make_block(display_date, items)

    lines = text.split("\n")
    section_start = None
    insert_idx = None

    for i, line in enumerate(lines):
        if re.match(rf"^#{1,6}\s+{re.escape(section)}\s*$", line):
            section_start = i
        elif section_start is not None and re.match(r"^#{1,6}\s+", line):
            insert_idx = i
            break

    if section_start is None:
        text = text.rstrip() + f"\n\n## {section}\n\n{new_block}"
    elif insert_idx is None:
        text = text.rstrip() + f"\n\n{new_block}"
    else:
        lines.insert(insert_idx, new_block + "\n")
        text = "\n".join(lines)

    target_path.write_text(text, encoding="utf-8")
    existing_dates.add(display_date)
    return True


def get_existing_dates(target_path: Path, section: str) -> set[str]:
    """이미 자존노트.md에 기록된 날짜 목록을 가져옵니다."""
    text = target_path.read_text(encoding="utf-8")
    in_section = False
    dates = set()
    date_pattern = re.compile(r"(\d{4}[.\-]\d{2}[.\-]\d{2})")
    for line in text.split("\n"):
        if re.match(rf"^#{1,6}\s+{re.escape(section)}\s*$", line):
            in_section = True
            continue
        if in_section and re.match(r"^#{1,6}\s+", line):
            break
        if in_section:
            m = date_pattern.search(line)
            if m:
                dates.add(m.group(1))
    return dates


def main():
    cfg = load_config()
    obs = cfg["obsidian"]
    notes = cfg["notes"]

    vault = find_vault(obs.get("vault_path", "").strip())
    daily_folder = obs.get("daily_folder", "Daily").strip()
    daily_fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    output_fmt = obs.get("output_date_format", "%Y.%m.%d").strip()
    source_heading = notes.get("source_heading", "자존노트").strip()
    target_name = notes.get("target_note", "자존노트.md").strip()
    target_section = notes.get("target_section", "하루자존").strip()

    # 대상 노트 찾기
    target_path = next(vault.rglob(target_name), None)
    if not target_path:
        log.error("'%s' 파일을 볼트에서 찾을 수 없습니다.", target_name)
        sys.exit(1)

    log.info("대상 노트: %s", target_path)

    # 이미 기록된 날짜 불러오기
    existing_dates = get_existing_dates(target_path, target_section)
    log.info("이미 기록된 날짜 %d개", len(existing_dates))

    # 데일리노트 폴더 탐색
    daily_dir = vault / daily_folder if daily_folder else vault
    if not daily_dir.exists():
        log.error("데일리노트 폴더를 찾을 수 없습니다: %s", daily_dir)
        sys.exit(1)

    # 날짜순 정렬 후 처리
    daily_notes = sorted(daily_dir.glob("*.md"))
    total_added = 0
    processed_dates = []

    for note_path in daily_notes:
        date = parse_date_from_filename(note_path.stem, daily_fmt)
        if not date:
            continue
        display_date = date.strftime(output_fmt)

        items = extract_section_items(note_path, source_heading)
        if not items:
            continue

        added = append_to_target(display_date, items, target_path, target_section, existing_dates)
        if added:
            total_added += len(items)
            processed_dates.append(display_date)
            log.info("[OK] %s → %d개 항목 추가", display_date, len(items))

    log.info("")
    log.info("=== 백필 완료 ===")
    log.info("처리된 날짜: %d일", len(processed_dates))
    log.info("추가된 항목: %d개", total_added)
    if processed_dates:
        log.info("기간: %s ~ %s", processed_dates[0], processed_dates[-1])


if __name__ == "__main__":
    main()
