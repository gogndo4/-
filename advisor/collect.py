#!/usr/bin/env python3
"""브리핑·대화에 쓸 사용자 맥락 수집 — 데일리노트, 컨디션 트래커, 자존노트, 출력노트, 자기정보"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import vaultlib
from dashboard import parse_entries  # 자존노트/출력노트 날짜 블록 파서 재사용

# 자기정보 수집에서 제외할 노트 (자동 생성물)
EXCLUDE_NOTES = {
    "자존 대시보드.md", "출력 대시보드.md", "브리핑 아카이브.md", "참모총장 메모리.md",
    "자존노트.md", "출력노트.md",  # 별도 블록으로 이미 포함됨
}


def tracker_scores(vault: Path, days: int = 14) -> list[str]:
    """컨디션 트래커 플러그인이 저장한 점수 캐시를 읽는다 (플러그인이 없으면 빈 리스트)."""
    data_file = vault / ".obsidian" / "plugins" / "daily-condition-tracker" / "data.json"
    if not data_file.exists():
        return []
    try:
        data = json.loads(data_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    cache = data.get("cache", {})
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = []
    for date_str in sorted(cache):
        if date_str < cutoff:
            continue
        d = cache[date_str]
        score = d.get("conditionScore")
        boxes = d.get("checkboxItems", [])
        checked = d.get("checkedCount", 0)
        reason = d.get("scoreReason", "")
        row = f"{date_str}: "
        row += f"컨디션 {score}/10" if score else "점수 없음"
        if boxes:
            row += f", 루틴 체크 {checked}/{len(boxes)}"
        if reason and reason != "중립":
            row += f" ({reason})"
        rows.append(row)
    return rows


def dated_entries(vault: Path, note_name: str, section: str, last_n: int = 14) -> list[str]:
    """자존노트.md / 출력노트.md 형식(날짜 블록)의 최근 항목."""
    path = vaultlib.find_note_by_name(vault, note_name)
    if not path:
        return []
    entries = parse_entries(path, section)
    rows = []
    for date_str, items in entries[-last_n:]:
        for item in items:
            rows.append(f"{date_str}: {item}")
    return rows


def daily_notes_block(vault: Path, cfg, days: int = 3) -> str:
    """오늘 포함 최근 N일 데일리노트 원문."""
    obs = cfg["obsidian"]
    folder = obs.get("daily_folder", "Daily").strip()
    fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    parts = []
    for i in range(days):
        date = datetime.now() - timedelta(days=i)
        note = vaultlib.find_daily_note(vault, folder, fmt, date)
        label = "오늘" if i == 0 else ("어제" if i == 1 else f"{i}일 전")
        if note:
            text = vaultlib.read_note(note, max_chars=2500)
            parts.append(f"[{label} · {date.strftime(fmt)}]\n{text}")
        else:
            parts.append(f"[{label} · {date.strftime(fmt)}] (기록 없음)")
    return "\n\n".join(parts)


def profile_block(vault: Path, cfg, max_notes: int = 8) -> str:
    """자기정보 폴더(기본 '0.나')의 노트들 — 사용자가 스스로에 대해 정리해둔 자료."""
    folder_name = cfg.get("advisor", "profile_folder", fallback="0.나").strip()
    folder = None
    for p in vault.rglob(folder_name):
        if p.is_dir():
            folder = p
            break
    if not folder:
        return ""
    parts = []
    for f in sorted(folder.glob("*.md"))[:max_notes]:
        if f.name in EXCLUDE_NOTES:
            continue
        text = vaultlib.read_note(f, max_chars=1500)
        if text:
            parts.append(f"[{f.stem}]\n{text}")
    return "\n\n".join(parts)


def record_gap_days(vault: Path, cfg) -> int:
    """데일리노트가 마지막으로 작성된 날로부터 며칠 지났는지 (0 = 오늘 기록 있음)."""
    obs = cfg["obsidian"]
    folder = obs.get("daily_folder", "Daily").strip()
    fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    for i in range(30):
        date = datetime.now() - timedelta(days=i)
        if vaultlib.find_daily_note(vault, folder, fmt, date):
            return i
    return 30


def gather_context(cfg, vault: Path) -> dict[str, str]:
    """브리핑/대화 프롬프트에 넣을 맥락 블록 모음."""
    notes = cfg["notes"]
    out = cfg["output"] if cfg.has_section("output") else None

    esteem = dated_entries(
        vault,
        notes.get("target_note", "자존노트.md").strip(),
        notes.get("target_section", "하루자존").strip(),
    )
    output_rows = []
    if out:
        output_rows = dated_entries(
            vault,
            out.get("target_note", "출력노트.md").strip(),
            out.get("target_section", "출력기록").strip(),
        )

    tracker = tracker_scores(vault)
    gap = record_gap_days(vault, cfg)

    return {
        "daily_notes": daily_notes_block(vault, cfg),
        "tracker": "\n".join(tracker) if tracker else "(컨디션 트래커 데이터 없음)",
        "esteem": "\n".join(esteem) if esteem else "(자존노트 기록 없음)",
        "output": "\n".join(output_rows) if output_rows else "(출력 기록 없음 — 병목 지점)",
        "profile": profile_block(vault, cfg) or "(자기정보 노트 없음)",
        "gap_days": str(gap),
    }
