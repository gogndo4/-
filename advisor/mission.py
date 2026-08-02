#!/usr/bin/env python3
"""미션 엔진 — 의지력 없이 굴러가게 하는 심장.

상태 판단은 코드가 하고(속일 수 없음), AI는 그 상태에 맞는 개입만 한다.
주간 출력 상태머신:
    완료  : 이번 주 출력이 이미 나감 → 축하, 다음 수위는 선택
    제안  : 월~수, 아직 출력 없음 → 구체적 후보 1개 제안
    축소  : 목~금, 아직 출력 없음 → 30분짜리 최소 버전으로 축소
    마감  : 토~일, 아직 출력 없음 → 오늘 무조건, 가장 작은 실행 단계로
"""

import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import vaultlib
from dashboard import parse_entries

GOALS_NOTE = "목표.md"

GOALS_TEMPLATE = """# 목표

> 참모총장이 매일 이 노트를 읽고 판단 기준으로 삼습니다. 목표가 바뀌면 여기만 고치면 됩니다.

## 북극성 (전역일까지의 큰 그림)

- 전역(2027.07.18)까지 '하루의 밀도'를 다시 살아있는 커뮤니티로 만들고, 출력물 아카이브를 들고 나온다.

## 이번 분기 목표

- 하루의 밀도 4기 재개 (사전 알림 → 모집 → 운영)
- 스레드에 주 1회 이상 내 기록 기반 글 발행

## 주간 출력의 정의 (이번 주에 인정되는 것)

- 스레드/블로그 글 1편, 하루의 밀도 공지 1건, 필사 문장 큐레이션 1세트, 뉴스레터 1통
- 메모·정리·계획·도구 개선은 출력이 아니다

## 최소 기준 (바쁜 주의 마지노선)

- 필사 문장 1개 + 내 생각 3줄을 스레드에 올리기 (30분)

## 하지 않기로 한 것

- 출력 3회 연속 달성 전까지 도구/시스템 개선 금지
- 직전 주 출력이 없으면 새 인풋(강의·전자책·리서치) 금지
"""

ESCALATION_DIRECTIVES = {
    "완료": "이번 주 출력이 이미 나갔다. 구체적으로 축하하고, 원하면 다음 수위(4기 준비 등)를 가볍게 제안하라. 압박 금지.",
    "제안": "아직 주 초반이다. '목표' 노트의 주간 출력 정의에 맞는 이번 주 출력 후보를 딱 1개, 재료(최근 기록)까지 짚어서 제안하라.",
    "축소": "주 후반인데 아직 출력이 없다. '목표' 노트의 최소 기준으로 축소해서 제시하라. 30분 안에 끝나는 크기로, 첫 번째 물리적 행동(예: 스레드 앱 열기)까지 지정하라.",
    "마감": "주말이고 아직 출력이 없다. 오늘이 마감이다. 다른 모든 제안을 버리고 최소 기준 1개만, 지금 폰으로 즉시 할 수 있는 단계로 제시하라. 단, 비난이 아니라 참모가 마감을 챙기는 톤으로.",
}


def goals_path(vault: Path, cfg) -> Path:
    """목표 노트 경로. 없으면 템플릿으로 생성 (자존노트.md 옆)."""
    existing = vaultlib.find_note_by_name(vault, GOALS_NOTE)
    if existing:
        return existing
    anchor = vaultlib.find_note_by_name(
        vault, cfg.get("notes", "target_note", fallback="자존노트.md").strip()
    )
    path = (anchor.parent if anchor else vault) / GOALS_NOTE
    path.write_text(GOALS_TEMPLATE, encoding="utf-8")
    return path


def read_goals(vault: Path, cfg) -> str:
    return vaultlib.read_note(goals_path(vault, cfg), max_chars=2500)


def _extract_section_items(text: str, heading: str) -> list[str]:
    in_section = False
    items = []
    for line in text.split("\n"):
        if re.match(rf"^#{{1,6}}\s+{re.escape(heading)}\s*$", line):
            in_section = True
            continue
        if in_section and re.match(r"^#{1,6}\s+", line):
            break
        if in_section and line.strip():
            content = re.sub(r"^[-*]\s+", "", line.strip())
            if content:
                items.append(content)
    return items


def _week_outputs(vault: Path, cfg, now: datetime) -> list[str]:
    """이번 주(월요일부터)의 출력 — 출력노트.md 아카이브 + 아직 동기화 안 된 데일리노트까지 스캔."""
    monday = (now - timedelta(days=now.weekday())).date()
    found: list[str] = []
    seen: set[str] = set()

    # 1) 출력노트.md 아카이브
    if cfg.has_section("output"):
        out = cfg["output"]
        note = vaultlib.find_note_by_name(vault, out.get("target_note", "출력노트.md").strip())
        if note:
            for date_str, items in parse_entries(note, out.get("target_section", "출력기록").strip()):
                try:
                    d = datetime.strptime(date_str.replace("-", "."), "%Y.%m.%d").date()
                except ValueError:
                    continue
                if d >= monday:
                    for item in items:
                        if item not in seen:
                            seen.add(item)
                            found.append(f"{date_str}: {item}")

    # 2) 이번 주 데일리노트의 '출력' 섹션 (아직 아카이브에 안 들어간 것)
    obs = cfg["obsidian"]
    folder = obs.get("daily_folder", "Daily").strip()
    fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    heading = cfg.get("output", "source_heading", fallback="출력").strip() if cfg.has_section("output") else "출력"
    for i in range(now.weekday() + 1):
        date = now - timedelta(days=i)
        note = vaultlib.find_daily_note(vault, folder, fmt, date)
        if not note:
            continue
        for item in _extract_section_items(note.read_text(encoding="utf-8"), heading):
            if item not in seen:
                seen.add(item)
                found.append(f"{date.strftime('%Y.%m.%d')}: {item}")
    return found


def _streak_weeks(vault: Path, cfg, now: datetime) -> int:
    """직전 주부터 거슬러 올라가며 '출력 1개 이상' 연속 주 수 (이번 주 제외)."""
    if not cfg.has_section("output"):
        return 0
    out = cfg["output"]
    note = vaultlib.find_note_by_name(vault, out.get("target_note", "출력노트.md").strip())
    if not note:
        return 0
    weeks_with_output = set()
    for date_str, items in parse_entries(note, out.get("target_section", "출력기록").strip()):
        try:
            d = datetime.strptime(date_str.replace("-", "."), "%Y.%m.%d").date()
        except ValueError:
            continue
        if items:
            weeks_with_output.add((d - timedelta(days=d.weekday())).isoformat())
    streak = 0
    monday = (now - timedelta(days=now.weekday())).date()
    week = monday - timedelta(days=7)  # 직전 주부터
    while week.isoformat() in weeks_with_output:
        streak += 1
        week -= timedelta(days=7)
    return streak


def week_state(vault: Path, cfg, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    outputs = _week_outputs(vault, cfg, now)
    weekday = now.weekday()  # 월=0

    if outputs:
        level = "완료"
    elif weekday <= 2:
        level = "제안"
    elif weekday <= 4:
        level = "축소"
    else:
        level = "마감"

    days_left = 6 - weekday
    streak = _streak_weeks(vault, cfg, now)

    weeks_to_discharge = None
    discharge = cfg.get("output", "discharge_date", fallback="").strip() if cfg.has_section("output") else ""
    if discharge:
        try:
            d_day = datetime.strptime(discharge, "%Y-%m-%d").date()
            weeks_to_discharge = max(0, (d_day - now.date()).days // 7)
        except ValueError:
            pass

    return {
        "level": level,
        "outputs": outputs,
        "days_left": days_left,
        "streak_weeks": streak,
        "weeks_to_discharge": weeks_to_discharge,
        "directive": ESCALATION_DIRECTIVES[level],
    }


def status_text(state: dict) -> str:
    """디스코드 '상황' 명령용 — 코드가 계산한 있는 그대로의 상태."""
    lines = [f"📊 이번 주 미션 상태: **{state['level']}**"]
    if state["outputs"]:
        lines.append("이번 주 출력:")
        lines += [f"- {o}" for o in state["outputs"]]
    else:
        lines.append(f"이번 주 출력: 아직 없음 (일요일까지 {state['days_left']}일)")
    lines.append(f"연속 출력 주: {state['streak_weeks']}주")
    if state["weeks_to_discharge"] is not None:
        lines.append(f"전역까지 남은 출력 기회: {state['weeks_to_discharge']}번")
    return "\n".join(lines)


def mission_block(vault: Path, cfg, now: datetime | None = None) -> str:
    """프롬프트에 넣을 미션 상태 블록 — AI 개입 강도를 코드가 지시한다."""
    state = week_state(vault, cfg, now)
    outputs = "\n".join(f"- {o}" for o in state["outputs"]) if state["outputs"] else "(없음)"
    discharge = (
        f"\n전역까지 남은 출력 기회: {state['weeks_to_discharge']}번"
        if state["weeks_to_discharge"] is not None
        else ""
    )
    return f"""상태: {state['level']} | 이번 주 남은 날: {state['days_left']}일 | 연속 출력 주: {state['streak_weeks']}주{discharge}
이번 주 출력:
{outputs}

[개입 지시 — '오늘 하나만'은 반드시 이 지시를 따를 것]
{state['directive']}"""


def log_output(vault: Path, cfg, note: str) -> Path:
    """디스코드 '완료 ...' → 오늘 데일리노트 '출력' 섹션에 기록 (동기화가 아카이브로 옮김)."""
    obs = cfg["obsidian"]
    folder = obs.get("daily_folder", "Daily").strip()
    fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    heading = cfg.get("output", "source_heading", fallback="출력").strip() if cfg.has_section("output") else "출력"
    today = datetime.now()

    path = vaultlib.find_daily_note(vault, folder, fmt, today)
    if not path:
        parent = vault / folder if folder else vault
        parent.mkdir(parents=True, exist_ok=True)
        path = parent / f"{today.strftime(fmt)}.md"
        path.write_text(f"# {today.strftime(fmt)}\n", encoding="utf-8")

    text = path.read_text(encoding="utf-8")
    line = f"- {note.strip()}"
    section = f"## {heading}"
    if re.search(rf"^#{{1,6}}\s+{re.escape(heading)}\s*$", text, flags=re.M):
        m = re.search(rf"^(#{{1,6}}\s+{re.escape(heading)}\s*)$", text, flags=re.M)
        insert_at = m.end()
        text = f"{text[:insert_at]}\n{line}{text[insert_at:]}"
    else:
        text = f"{text.rstrip()}\n\n{section}\n\n{line}\n"
    path.write_text(text, encoding="utf-8")
    return path
