#!/usr/bin/env python3
"""참모총장 장기 기억 — 볼트 안 마크다운 노트로 저장 (옵시디언에서 직접 보고 수정 가능)"""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import vaultlib

TEMPLATE = """# 참모총장 메모리

> 참모총장 AI의 장기 기억 노트입니다. 직접 수정해도 되고, 디스코드에서 "기억해 ..."라고 말하면 여기에 쌓입니다.

## 나에 대해

-

## 진행 중인 목표

-

## 대화에서 기억할 것

"""

REMEMBER_SECTION = "## 대화에서 기억할 것"
DAILY_MEMO_SECTION = "## 디스코드 메모"


def memory_path(vault: Path, cfg) -> Path:
    """메모리 노트 경로. 없으면 자존노트.md 옆(0.나 폴더)에 생성."""
    name = cfg.get("advisor", "memory_note", fallback="참모총장 메모리.md").strip()
    existing = vaultlib.find_note_by_name(vault, name)
    if existing:
        return existing

    anchor = vaultlib.find_note_by_name(
        vault, cfg.get("notes", "target_note", fallback="자존노트.md").strip()
    )
    folder = anchor.parent if anchor else vault
    path = folder / name
    path.write_text(TEMPLATE, encoding="utf-8")
    return path


def read(vault: Path, cfg, max_chars: int = 3000) -> str:
    return vaultlib.read_note(memory_path(vault, cfg), max_chars=max_chars)


def remember(vault: Path, cfg, note: str) -> Path:
    """'대화에서 기억할 것' 섹션에 날짜와 함께 한 줄 추가."""
    path = memory_path(vault, cfg)
    text = path.read_text(encoding="utf-8")
    line = f"- {datetime.now().strftime('%Y.%m.%d')} {note.strip()}"

    if REMEMBER_SECTION in text:
        head, _, tail = text.partition(REMEMBER_SECTION)
        text = f"{head}{REMEMBER_SECTION}{tail.rstrip()}\n{line}\n"
    else:
        text = f"{text.rstrip()}\n\n{REMEMBER_SECTION}\n\n{line}\n"

    path.write_text(text, encoding="utf-8")
    return path


def write_daily(vault: Path, cfg, note: str) -> Path:
    """오늘 데일리노트의 '디스코드 메모' 섹션에 한 줄 대필 (노트가 없으면 생성)."""
    obs = cfg["obsidian"]
    folder = obs.get("daily_folder", "Daily").strip()
    fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    today = datetime.now()

    path = vaultlib.find_daily_note(vault, folder, fmt, today)
    if not path:
        date_str = today.strftime(fmt)
        parent = vault / folder if folder else vault
        parent.mkdir(parents=True, exist_ok=True)
        path = parent / f"{date_str}.md"
        path.write_text(f"# {date_str}\n", encoding="utf-8")

    text = path.read_text(encoding="utf-8")
    line = f"- {today.strftime('%H:%M')} {note.strip()}"
    if DAILY_MEMO_SECTION in text:
        head, _, tail = text.partition(DAILY_MEMO_SECTION)
        text = f"{head}{DAILY_MEMO_SECTION}{tail.rstrip()}\n{line}\n"
    else:
        text = f"{text.rstrip()}\n\n{DAILY_MEMO_SECTION}\n\n{line}\n"
    path.write_text(text, encoding="utf-8")
    return path
