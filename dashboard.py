#!/usr/bin/env python3
"""
자존노트 인사이트 대시보드 생성기
"""

import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

# 강점 영역 키워드 분류표
CATEGORIES = {
    "🤝 관계·소통": [
        "친구", "가족", "대화", "도움", "같이", "함께", "누군가", "연락", "만남",
        "이야기", "들어줬", "위로", "공감", "사람", "관계", "소통", "나눴", "챙겼"
    ],
    "💪 자기관리": [
        "운동", "건강", "수면", "청소", "정리", "식사", "명상", "잠", "산책",
        "루틴", "습관", "꾸준", "먹었", "쉬었", "관리", "챙겼", "물"
    ],
    "✅ 성취·완료": [
        "완료", "해결", "끝냈", "마쳤", "성공", "발표", "제출", "달성", "처리",
        "실행", "완성", "해냈", "했다", "마무리", "클리어", "처리했", "마쳤"
    ],
    "📚 배움·성장": [
        "배웠", "공부", "읽었", "책", "새로운", "알게", "이해", "깨달았", "배움",
        "강의", "학습", "익혔", "터득", "발견", "연구", "시도", "도전", "첫"
    ],
    "❤️ 감정·마음": [
        "즐거웠", "행복", "뿌듯", "감사", "기뻤", "좋았", "편안", "설레", "만족",
        "기분", "웃었", "행복했", "따뜻", "충만", "여유", "평온", "흐뭇"
    ],
}


def parse_entries(target_path: Path, section: str) -> list[tuple[str, list[str]]]:
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


def classify_item(item: str) -> str:
    for category, keywords in CATEGORIES.items():
        for kw in keywords:
            if kw in item:
                return category
    return None


def category_scores(entries: list[tuple[str, list[str]]]) -> dict[str, int]:
    scores = defaultdict(int)
    for _, items in entries:
        for item in items:
            cat = classify_item(item)
            if cat:
                scores[cat] += 1
    return scores


def bar(count: int, max_count: int, width: int = 10) -> str:
    filled = round(count / max_count * width) if max_count else 0
    return "█" * filled + "░" * (width - filled)


def peak_days(entries: list[tuple[str, list[str]]], top_n: int = 3) -> list[tuple[str, list[str]]]:
    return sorted(entries, key=lambda x: len(x[1]), reverse=True)[:top_n]


def recent_entries(entries: list[tuple[str, list[str]]], days: int = 7) -> list[tuple[str, list[str]]]:
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y.%m.%d")
    return [(d, items) for d, items in entries if d >= cutoff]


def streak(entries: list[tuple[str, list[str]]]) -> int:
    if not entries:
        return 0
    dates = sorted(set(d for d, _ in entries), reverse=True)
    today = datetime.now().date()
    count = 0
    for i, d in enumerate(dates):
        expected = (today - timedelta(days=i)).strftime("%Y.%m.%d")
        if d == expected:
            count += 1
        else:
            break
    return count


def generate_dashboard(
    entries: list[tuple[str, list[str]]],
    output_path: Path,
    now: datetime,
    insight_text: str = "",
):
    if not entries:
        return

    scores = category_scores(entries)
    max_score = max(scores.values()) if scores else 1
    total_items = sum(len(i) for _, i in entries)
    current_streak = streak(entries)
    top_days = peak_days(entries)
    this_week = recent_entries(entries, 7)

    lines = [
        "# 나는 어떤 사람인가",
        f"> 마지막 업데이트: {now.strftime('%Y.%m.%d %H:%M')}  |  총 {len(entries)}일  {total_items}개 기록",
        "",
        "---",
        "",
        "## 강점 영역",
        "",
        "어떤 순간에 내가 잘 하는지 보여줍니다.",
        "",
    ]

    for cat in CATEGORIES:
        count = scores.get(cat, 0)
        lines.append(f"`{bar(count, max_score)}` {cat}  **{count}회**")

    lines += [
        "",
        "---",
        "",
        "## 자존감이 가장 높았던 날",
        "",
        "가장 많은 잘한 일을 기록한 날들입니다.",
        "",
    ]
    for rank, (date_str, items) in enumerate(top_days, 1):
        lines.append(f"**{rank}위 · {date_str}** — {len(items)}개")
        for item in items[:3]:
            lines.append(f"- {item}")
        if len(items) > 3:
            lines.append(f"- _{len(items) - 3}개 더..._")
        lines.append("")

    lines += [
        "---",
        "",
        f"## 이번 주의 나  {'🔥' * min(current_streak, 5)}",
        "",
        f"연속 기록 **{current_streak}일**  |  최근 7일 기록 **{len(this_week)}일**",
        "",
    ]
    if this_week:
        for date_str, items in reversed(this_week):
            lines.append(f"**{date_str}**")
            for item in items:
                lines.append(f"- {item}")
            lines.append("")
    else:
        lines.append("_이번 주 기록이 없습니다._")

    lines += [
        "---",
        "",
        "## Claude 분석 (월 1회 업데이트)",
        "",
    ]
    if insight_text:
        lines.append(insight_text)
    else:
        lines += [
            "_아직 분석이 없습니다._",
            "",
            "**방법:** `insight_esteem.py` 실행 → 생성된 프롬프트를 Claude에게 붙여넣기 → 결과를 여기에 붙여넣기",
        ]

    output_path.write_text("\n".join(lines), encoding="utf-8")
