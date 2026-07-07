#!/usr/bin/env python3
"""참모총장 공용 유틸 — 설정 로드, 볼트 탐색, 노트 읽기"""

import configparser
import os
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent.parent


def load_config() -> configparser.ConfigParser:
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read(REPO_DIR / "config.ini", encoding="utf-8")
    return cfg


def find_vault(hint: str = "") -> Path:
    """볼트 경로 지정값 → 환경변수 → 자동 탐색 순서로 찾는다."""
    hint = (hint or os.environ.get("ADVISOR_VAULT", "")).strip()
    if hint:
        p = Path(hint)
        if p.exists():
            return p
        raise FileNotFoundError(f"vault_path 경로가 존재하지 않습니다: {hint}")

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

    raise FileNotFoundError(
        "옵시디언 볼트를 찾지 못했습니다. config.ini 의 vault_path 를 입력해주세요."
    )


def read_note(path: Path, max_chars: int = 4000) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    if len(text) > max_chars:
        text = text[:max_chars] + "\n...(길어서 생략)..."
    return text.strip()


def find_daily_note(vault: Path, folder: str, fmt: str, date) -> Path | None:
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


def find_note_by_name(vault: Path, name: str) -> Path | None:
    for p in vault.rglob(name):
        return p
    return None
