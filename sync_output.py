#!/usr/bin/env python3
"""
Obsidian 데일리노트 '출력' 섹션 → 출력노트.md 아카이브 + 출력 대시보드 생성
주 1회 실행하세요. config.ini 의 [output] 섹션을 읽어 동작합니다.

'출력' = 내 손을 떠나 타인이 볼 수 있게 발행된 완결물 (글, 공지, 콘텐츠 등)
"""

import configparser
import re
import sys
import logging
from datetime import datetime, timedelta, date
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOG_FILE = SCRIPT_DIR / "sync_output.log"

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
    # interpolation=None: 날짜 포맷의 % 기호가 보간 문법으로 해석되는 것을 방지
    cfg = configparser.ConfigParser(interpolation=None)
    cfg_path = SCRIPT_DIR / "config.ini"
    if not cfg_path.exists():
        log.error("config.ini 파일이 없습니다: %s", cfg_path)
        sys.exit(1)
    cfg.read(cfg_path, encoding="utf-8")
    return cfg


def find_vault(hint: str) -> Path:
    if hint:
        p = Path(hint)
        if p.exists():
            return p
        log.error("config.ini 의 vault_path 경로가 존재하지 않습니다: %s", hint)
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


def extract_section_items(note_path: Path, heading: str) -> list[str]:
    text = note_path.read_text(encoding="utf-8")
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


def collect_entries(
    vault: Path, daily_folder: str, daily_fmt: str, heading: str, output_fmt: str
) -> list[tuple[date, str, list[str]]]:
    """모든 데일리노트에서 출력 항목을 수집합니다. (날짜, 표시날짜, 항목들)"""
    daily_dir = vault / daily_folder if daily_folder else vault
    if not daily_dir.exists():
        log.error("데일리노트 폴더를 찾을 수 없습니다: %s", daily_dir)
        sys.exit(1)

    entries = []
    for note_path in sorted(daily_dir.glob("*.md")):
        try:
            d = datetime.strptime(note_path.stem, daily_fmt).date()
        except ValueError:
            continue
        items = extract_section_items(note_path, heading)
        if items:
            entries.append((d, d.strftime(output_fmt), items))
    return entries


def get_existing_dates(target_path: Path, section: str) -> set[str]:
    text = target_path.read_text(encoding="utf-8")
    in_section = False
    dates = set()
    date_pattern = re.compile(r"(\d{4}[.\-]\d{2}[.\-]\d{2})")
    for line in text.split("\n"):
        if re.match(rf"^#{{1,6}}\s+{re.escape(section)}\s*$", line):
            in_section = True
            continue
        if in_section and re.match(r"^#{1,6}\s+", line):
            break
        if in_section:
            m = date_pattern.search(line)
            if m:
                dates.add(m.group(1))
    return dates


def append_to_target(
    display_date: str, items: list[str], target_path: Path, section: str, existing: set[str]
) -> bool:
    if display_date in existing:
        return False
    text = target_path.read_text(encoding="utf-8")
    bullet_lines = "\n".join(f"- {item}" for item in items)
    new_block = f"{display_date}\n\n{bullet_lines}\n"

    lines = text.split("\n")
    section_start = None
    insert_idx = None
    for i, line in enumerate(lines):
        if re.match(rf"^#{{1,6}}\s+{re.escape(section)}\s*$", line):
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
    existing.add(display_date)
    return True


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def generate_dashboard(
    entries: list[tuple[date, str, list[str]]],
    output_path: Path,
    now: datetime,
    discharge: date,
    weekly_goal: int,
):
    today = now.date()
    this_monday = monday_of(today)

    # 주별 출력 개수 집계 (주의 시작 = 월요일)
    weekly: dict[date, int] = {}
    for d, _, items in entries:
        wk = monday_of(d)
        weekly[wk] = weekly.get(wk, 0) + len(items)

    this_week_count = weekly.get(this_monday, 0)

    # 연속 출력 주 (이번 주는 아직 진행 중이므로 미달성이어도 streak 를 끊지 않음)
    streak = 0
    wk = this_monday if this_week_count >= weekly_goal else this_monday - timedelta(days=7)
    while weekly.get(wk, 0) >= weekly_goal:
        streak += 1
        wk -= timedelta(days=7)

    days_left = (discharge - today).days
    weeks_left = max(0, -(-days_left // 7))  # ceil

    total_items = sum(len(i) for _, _, i in entries)

    lines = [
        "# 출력 대시보드",
        f"> 마지막 업데이트: {now.strftime('%Y.%m.%d %H:%M')}  |  "
        f"총 {len(weekly)}주 동안 {total_items}개 출력",
        "",
        "> 출력 = 내 손을 떠나 타인이 볼 수 있는 완결물. 메모·정리·계획·도구 개선은 출력이 아니다.",
        "",
        "---",
        "",
        "## 이번 주",
        "",
    ]

    if this_week_count >= weekly_goal:
        lines.append(f"**{this_week_count} / {weekly_goal} 완료** ✅ 이번 주 몫은 끝났다.")
    else:
        days_to_sunday = 6 - today.weekday()
        lines.append(
            f"**{this_week_count} / {weekly_goal}** — 이번 주 마감까지 {days_to_sunday}일. "
            "가장 만만한 출력 하나를 오늘 내보내자."
        )

    lines += [
        "",
        f"연속 출력 **{streak}주** {'🔥' * min(streak, 5)}",
        "",
        "---",
        "",
        "## 전역까지",
        "",
        f"- 전역일: {discharge.strftime('%Y.%m.%d')} (D-{days_left})",
        f"- **남은 출력 기회: {weeks_left}번**",
        f"- 지금까지 쓴 기회: {len(weekly)}주 / 놓친 주는 돌아오지 않는다",
        "",
        "---",
        "",
        "## 최근 12주",
        "",
        "| 주 (월요일 시작) | 출력 수 | 달성 |",
        "|---|---|---|",
    ]

    for i in range(12):
        wk = this_monday - timedelta(days=7 * i)
        count = weekly.get(wk, 0)
        if wk == this_monday and count < weekly_goal:
            mark = "🕐 진행 중"
        else:
            mark = "✅" if count >= weekly_goal else "—"
        lines.append(f"| {wk.strftime('%Y.%m.%d')} | {count} | {mark} |")

    lines += ["", "---", "", "## 최근 출력", ""]
    recent = [e for e in entries if e[0] >= today - timedelta(days=28)]
    if recent:
        for _, display, items in reversed(recent):
            lines.append(f"**{display}**")
            for item in items:
                lines.append(f"- {item}")
            lines.append("")
    else:
        lines.append("_최근 4주간 출력 기록이 없습니다. 이번 주가 다시 시작할 기회입니다._")

    output_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    cfg = load_config()
    obs = cfg["obsidian"]
    out = cfg["output"] if cfg.has_section("output") else {}

    vault = find_vault(obs.get("vault_path", "").strip())
    daily_folder = obs.get("daily_folder", "Daily").strip()
    daily_fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    output_fmt = obs.get("output_date_format", "%Y.%m.%d").strip()

    source_heading = out.get("source_heading", "출력").strip()
    target_name = out.get("target_note", "출력노트.md").strip()
    target_section = out.get("target_section", "출력기록").strip()
    dashboard_name = out.get("dashboard_note", "출력 대시보드.md").strip()
    weekly_goal = int(out.get("weekly_goal", "1"))
    discharge = datetime.strptime(
        out.get("discharge_date", "2027-07-18").strip(), "%Y-%m-%d"
    ).date()

    entries = collect_entries(vault, daily_folder, daily_fmt, source_heading, output_fmt)
    log.info("데일리노트에서 출력 기록 %d일치 발견", len(entries))

    # 대상 노트: 없으면 자존노트.md 옆(같은 폴더)에 생성
    target_path = next(vault.rglob(target_name), None)
    if not target_path:
        esteem_note = cfg["notes"].get("target_note", "자존노트.md").strip()
        esteem_path = next(vault.rglob(esteem_note), None)
        parent = esteem_path.parent if esteem_path else vault
        target_path = parent / target_name
        target_path.write_text(f"# 출력노트\n\n## {target_section}\n", encoding="utf-8")
        log.info("대상 노트 생성: %s", target_path)

    existing = get_existing_dates(target_path, target_section)
    added = 0
    for _, display, items in entries:
        if append_to_target(display, items, target_path, target_section, existing):
            added += len(items)
            log.info("[OK] %s → %d개 항목 추가", display, len(items))
    if added == 0:
        log.info("새로 추가할 출력 기록이 없습니다.")

    dashboard_path = target_path.parent / dashboard_name
    generate_dashboard(entries, dashboard_path, datetime.now(), discharge, weekly_goal)
    log.info("[OK] 대시보드 업데이트 완료: %s", dashboard_path)


if __name__ == "__main__":
    main()
