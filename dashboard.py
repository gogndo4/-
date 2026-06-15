#!/usr/bin/env python3
"""
자존노트 데이터로 대시보드 마크다운 파일을 자동 생성합니다.
sync_esteem.py 실행 시 함께 호출됩니다.
"""

import re
from collections import Counter
from datetime import datetime
from pathlib import Path


def parse_entries(target_path: Path, section: str) -> list[tuple[str, list[str]]]:
    """하루 자존 섹션에서 날짜별 항목을 파싱합니다."""
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


def get_month(date_str: str) -> str:
    return date_str[:7]  # YYYY.MM


def top_keywords(entries: list[tuple[str, list[str]]], top_n: int = 10) -> list[tuple[str, int]]:
    """항목에서 자주 등장하는 키워드를 추출합니다."""
    stop = {"했다", "했습니다", "하다", "했어", "했음", "을", "를", "이", "가", "의",
            "에", "에서", "으로", "로", "과", "와", "도", "은", "는", "이다", "있다",
            "없다", "그", "나", "내", "것", "수", "오늘", "하고", "그리고", "했", "함",
            "할", "한", "했던", "위해", "통해", "대해", "정말", "너무", "아주", "매우",
            "잘", "더", "또", "및", "등", "후", "전", "때", "동안", "까지", "부터"}

    counter: Counter = Counter()
    for _, items in entries:
        for item in items:
            words = re.split(r"[\s,\.!?~]+", item)
            for w in words:
                w = re.sub(r"[^\w]", "", w)
                if len(w) >= 2 and w not in stop:
                    counter[w] += 1

    return counter.most_common(top_n)


def generate_dashboard(
    entries: list[tuple[str, list[str]]],
    output_path: Path,
    now: datetime,
):
    if not entries:
        return

    total_days = len(entries)
    total_items = sum(len(items) for _, items in entries)
    first_date = entries[0][0]
    last_date = entries[-1][0]

    # 월별 집계
    monthly: dict[str, dict] = {}
    for date_str, items in entries:
        m = get_month(date_str)
        if m not in monthly:
            monthly[m] = {"days": 0, "items": 0}
        monthly[m]["days"] += 1
        monthly[m]["items"] += len(items)

    # 이번 달 최근 10일
    current_month = now.strftime("%Y.%m")
    recent = [(d, items) for d, items in entries if d.startswith(current_month)][-10:]

    # 키워드
    keywords = top_keywords(entries)

    lines = [
        f"# 자존 대시보드",
        f"> 마지막 업데이트: {now.strftime('%Y.%m.%d %H:%M')}",
        "",
        "## 전체 현황",
        "",
        f"| 항목 | 값 |",
        f"|------|-----|",
        f"| 총 기록 일수 | {total_days}일 |",
        f"| 총 항목 수 | {total_items}개 |",
        f"| 첫 기록 | {first_date} |",
        f"| 최근 기록 | {last_date} |",
        f"| 일평균 항목 | {total_items / total_days:.1f}개 |",
        "",
        "## 월별 현황",
        "",
        "| 월 | 기록 일수 | 항목 수 |",
        "|-----|---------|--------|",
    ]

    for month in sorted(monthly.keys(), reverse=True):
        d = monthly[month]
        lines.append(f"| {month} | {d['days']}일 | {d['items']}개 |")

    lines += [
        "",
        "## 자주 등장한 키워드 TOP 10",
        "",
        "| 키워드 | 횟수 |",
        "|--------|------|",
    ]
    for word, count in keywords:
        lines.append(f"| {word} | {count}회 |")

    lines += [
        "",
        f"## 이번 달 기록 ({current_month})",
        "",
    ]
    if recent:
        for date_str, items in reversed(recent):
            lines.append(f"**{date_str}**")
            for item in items:
                lines.append(f"- {item}")
            lines.append("")
    else:
        lines.append("이번 달 기록이 아직 없습니다.")

    output_path.write_text("\n".join(lines), encoding="utf-8")
