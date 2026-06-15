#!/usr/bin/env python3
"""
Obsidian 데일리노트 자존노트 → 0.나 하루자존 자동 동기화 스크립트
config.ini 설정을 읽어 실행합니다.
"""

import configparser
import re
import sys
import logging
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOG_FILE = SCRIPT_DIR / "sync_esteem.log"

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
    if not cfg_path.exists():
        log.error("config.ini 파일이 없습니다: %s", cfg_path)
        sys.exit(1)
    cfg.read(cfg_path, encoding="utf-8")
    return cfg


def find_vault(hint: str) -> Path | None:
    """볼트 경로를 직접 지정했으면 검증, 없으면 Windows 일반 경로에서 자동 탐색."""
    if hint:
        p = Path(hint)
        if p.exists():
            return p
        log.error("config.ini 의 vault_path 경로가 존재하지 않습니다: %s", hint)
        sys.exit(1)

    # 자동 탐색: .obsidian 폴더를 가진 디렉터리 검색
    search_roots = [
        Path.home() / "Documents",
        Path.home() / "OneDrive" / "Documents",
        Path.home() / "OneDrive",
        Path.home(),
    ]
    for root in search_roots:
        if not root.exists():
            continue
        for obsidian_dir in root.rglob(".obsidian"):
            vault = obsidian_dir.parent
            log.info("볼트 자동 감지: %s", vault)
            return vault

    log.error(
        "옵시디언 볼트를 자동으로 찾지 못했습니다. "
        "config.ini 의 vault_path 에 경로를 직접 입력해주세요."
    )
    sys.exit(1)


def find_daily_note(vault: Path, folder: str, fmt: str, date: datetime) -> Path | None:
    date_str = date.strftime(fmt)
    candidates = [
        vault / folder / f"{date_str}.md" if folder else vault / f"{date_str}.md",
        vault / f"{date_str}.md",
    ]
    for p in candidates:
        if p.exists():
            return p
    for p in vault.rglob(f"{date_str}.md"):
        return p
    return None


def extract_section_items(note_path: Path, heading: str) -> list[str]:
    """지정한 헤딩 아래 항목을 추출합니다."""
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


def find_target_note(vault: Path, name: str) -> Path | None:
    for path in vault.rglob(name):
        return path
    return None


def append_to_section(
    items: list[str], date: datetime, target_path: Path, section: str, date_fmt: str
):
    """대상 노트의 섹션 맨 아래에 항목을 추가합니다. 중복 날짜는 스킵."""
    text = target_path.read_text(encoding="utf-8")
    date_str = date.strftime(date_fmt)

    if date_str in text:
        log.info("[SKIP] %s 날짜가 이미 기록되어 있습니다.", date_str)
        return

    new_block = "\n".join(f"- {date_str} - {item}" for item in items)

    lines = text.split("\n")
    section_start = None
    insert_idx = None

    for i, line in enumerate(lines):
        if re.match(rf"^#{1,6}\s+{re.escape(section)}\s*$", line):
            section_start = i
        elif section_start is not None and re.match(r"^#{1,6}\s+", line):
            # 다음 헤딩 직전 = 섹션 끝
            insert_idx = i
            break

    if section_start is None:
        # 섹션 자체가 없으면 파일 끝에 새로 생성
        text = text.rstrip() + f"\n\n## {section}\n{new_block}\n"
    elif insert_idx is None:
        # 섹션이 마지막 섹션인 경우 → 파일 맨 끝에 추가
        text = text.rstrip() + f"\n{new_block}\n"
    else:
        # 섹션 끝(다음 헤딩 바로 위)에 추가
        lines.insert(insert_idx, new_block + "\n")
        text = "\n".join(lines)

    target_path.write_text(text, encoding="utf-8")
    log.info("[OK] %s 자존노트 %d개 항목 추가 완료", date_str, len(items))
    for item in items:
        log.info("  - %s - %s", date_str, item)


def main():
    cfg = load_config()
    obs = cfg["obsidian"]
    notes = cfg["notes"]

    vault = find_vault(obs.get("vault_path", "").strip())
    daily_folder = obs.get("daily_folder", "Daily").strip()
    daily_fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    source_heading = notes.get("source_heading", "자존노트").strip()
    target_name = notes.get("target_note", "0.나.md").strip()
    target_section = notes.get("target_section", "하루자존").strip()

    yesterday = datetime.now() - timedelta(days=1)
    date_str = yesterday.strftime(daily_fmt)

    daily_note = find_daily_note(vault, daily_folder, daily_fmt, yesterday)
    if not daily_note:
        log.warning("%s 데일리노트를 찾을 수 없습니다.", date_str)
        sys.exit(0)

    items = extract_section_items(daily_note, source_heading)
    if not items:
        log.info("%s 자존노트에 기록된 내용이 없습니다.", date_str)
        sys.exit(0)

    target_path = find_target_note(vault, target_name)
    if not target_path:
        log.error("'%s' 파일을 볼트에서 찾을 수 없습니다.", target_name)
        sys.exit(1)

    append_to_section(items, yesterday, target_path, target_section, daily_fmt)


if __name__ == "__main__":
    main()
