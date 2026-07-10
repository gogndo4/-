#!/usr/bin/env python3
"""블로그 파이프라인 — 아침 글감 5개 제안 → 사장님이 선택 → 사장님 문체로 초안 작성

원칙 (병목 진단의 교훈): AI가 글을 대신 쓰는 게 아니라,
사장님의 기록에서 재료를 찾고, 사장님의 문체(블로그백업 기준)로 초벌하고,
고르고 다듬는 저자의 몫은 사장님에게 남긴다.
"""

import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parent))

import brain
import collect
import vaultlib

STATE_FILE = SCRIPT_DIR / "blog_state.json"

# 백업 폴더 자동 탐색 후보 (config [blog] backup_folder 가 비어있을 때)
BACKUP_FOLDER_CANDIDATES = ["블로그백업", "블로그 백업", "블로그", "blog"]

# 생각/인사이트 노트 폴더 자동 탐색 후보 (config [blog] insight_folders 가 비어있을 때)
INSIGHT_FOLDER_CANDIDATES = ["생각", "인사이트", "글감", "기록", "메모", "아이디어"]

STYLE_RULES = """[사장님 블로그 문체 규칙 — 아래 실제 글 예시가 최우선 기준]
- 존댓말(~합니다체). 독자에게 직접 말을 걸고 질문을 던진다.
- 구조: 개인 경험이나 구체적 장면으로 시작 → 생각의 전개 → 삶에 적용하는 통찰.
- 제목은 통찰을 담은 한 문장형 (예: "느끼는 것을 풀어내는 것도 행복한 일이다", "계획은 완벽할수록 실패합니다").
- 문단은 짧게. 과장/클리셰/자기계발 상투어 금지.
- 마지막은 "오늘도 0.1%씩 성장하세요~!"로 맺는다."""


# ── 상태 (오늘의 주제 목록) ──

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def todays_topics() -> list[str]:
    state = load_state()
    if state.get("date") == datetime.now().strftime("%Y-%m-%d"):
        return state.get("topics", [])
    return []


def topic_by_number(n: int) -> str | None:
    topics = todays_topics()
    if 1 <= n <= len(topics):
        return topics[n - 1]
    return None


# ── 재료 수집 ──

def find_backup_folder(vault: Path, cfg) -> Path | None:
    name = ""
    if cfg.has_section("blog"):
        name = cfg.get("blog", "backup_folder", fallback="").strip()
    candidates = [name] if name else BACKUP_FOLDER_CANDIDATES
    for cand in candidates:
        if not cand:
            continue
        for p in vault.rglob(cand):
            if p.is_dir() and any(p.glob("*.md")):
                return p
    return None


def style_examples(vault: Path, cfg, n: int = 2, each_chars: int = 1800) -> str:
    """블로그백업에서 최근 글 n편을 문체 예시로 추출."""
    folder = find_backup_folder(vault, cfg)
    if not folder:
        return "(블로그백업 폴더를 찾지 못함 — 위 문체 규칙만 따를 것)"
    files = sorted(folder.glob("*.md"), key=lambda f: f.stat().st_mtime, reverse=True)[:n]
    parts = []
    for f in files:
        parts.append(f"[예시: {f.stem}]\n{vaultlib.read_note(f, max_chars=each_chars)}")
    return "\n\n".join(parts) if parts else "(백업 글 없음)"


def insight_notes(vault: Path, cfg, max_notes: int = 12, total_chars: int = 5000) -> str:
    """사장님이 정리해둔 생각·인사이트 노트 — 글감의 1순위 원천.
    config [blog] insight_folders (쉼표 구분) 지정 시 그 폴더들, 비어있으면 자동 탐색."""
    names = []
    if cfg.has_section("blog"):
        raw = cfg.get("blog", "insight_folders", fallback="").strip()
        names = [n.strip() for n in raw.split(",") if n.strip()]
    if not names:
        names = INSIGHT_FOLDER_CANDIDATES

    backup = find_backup_folder(vault, cfg)
    draft_folder_name = cfg.get("blog", "draft_folder", fallback="블로그 초안").strip() if cfg.has_section("blog") else "블로그 초안"

    # 폴더명 부분 일치 탐색 ("1.생각", "생각 정리" 같은 변형도 잡는다)
    folders = []
    for p in vault.rglob("*"):
        if not p.is_dir():
            continue
        if any(part.startswith(".") for part in p.relative_to(vault).parts):
            continue
        if p == backup or p.name == draft_folder_name:
            continue
        if any(name in p.name for name in names) and p not in folders:
            folders.append(p)

    files: list[Path] = []
    for folder in folders:
        files += [f for f in folder.rglob("*.md")]
    # 최근에 만지거나 쓴 생각일수록 지금의 사장님과 가까움
    files = sorted(set(files), key=lambda f: f.stat().st_mtime, reverse=True)[:max_notes]

    parts, used = [], 0
    for f in files:
        excerpt = vaultlib.read_note(f, max_chars=600)
        if not excerpt:
            continue
        block = f"[{f.stem}]\n{excerpt}"
        if used + len(block) > total_chars:
            break
        parts.append(block)
        used += len(block)
    return "\n\n".join(parts)


def insights_digest(vault: Path, cfg, days: int = 10) -> str:
    """최근 데일리노트 + 자존노트 — 글감의 원천."""
    obs = cfg["obsidian"]
    folder = obs.get("daily_folder", "Daily").strip()
    fmt = obs.get("daily_format", "%Y-%m-%d").strip()
    parts = []
    for i in range(days):
        date = datetime.now() - timedelta(days=i)
        note = vaultlib.find_daily_note(vault, folder, fmt, date)
        if note:
            parts.append(f"[{date.strftime(fmt)}]\n{vaultlib.read_note(note, max_chars=900)}")
    notes = cfg["notes"]
    esteem = collect.dated_entries(
        vault,
        notes.get("target_note", "자존노트.md").strip(),
        notes.get("target_section", "하루자존").strip(),
        last_n=14,
    )
    if esteem:
        parts.append("[자존노트 최근 기록]\n" + "\n".join(esteem))
    return "\n\n".join(parts) if parts else "(최근 기록 없음)"


# ── 1단계: 아침 글감 제안 ──

TOPICS_SYSTEM = """너는 사장님의 블로그 편집장이다. 아래 기록에서 글감을 찾아 오늘의 블로그 주제 후보를 제안하라.

재료의 우선순위:
1순위 — [정리된 생각·인사이트 노트]: 사장님이 시간을 들여 정리해둔 생각. 여기서 최소 {n_insight}개 이상 뽑을 것.
2순위 — [최근 데일리 기록]: 요즘의 경험·감정. 시의성 있는 글감으로.
두 재료를 엮은 주제(옛 생각 + 최근 경험)가 가장 좋은 글감이다.

규칙:
- 정확히 {n}개. 각 줄 형식: "N. 제목 — 재료: 어느 노트/기록에서 나왔는지 한 줄"
- 제목은 사장님 블로그 제목 스타일(통찰을 담은 한 문장형, 예시 글 참고).
- 기록에 없는 일반론 주제 금지. 실제로 존재하는 사장님의 경험·감정·생각만.
- 이미 블로그백업에 있는 글, 그리고 [지난 제안 주제]와 겹치는 주제는 피한다.
- 다른 말 없이 번호 목록만 출력."""


def suggest_topics(cfg, vault: Path) -> str:
    num = int(cfg.get("blog", "num_topics", fallback="5")) if cfg.has_section("blog") else 5
    system = TOPICS_SYSTEM.format(n=num, n_insight=max(1, num - 2))

    state = load_state()
    history = state.get("history", [])
    history_block = "\n".join(f"- {t}" for t in history[-40:]) if history else "(없음)"

    insights = insight_notes(vault, cfg)
    user = f"""[사장님 블로그 문체/제목 예시]
{style_examples(vault, cfg)}

[정리된 생각·인사이트 노트 — 1순위 재료]
{insights if insights else "(생각 노트를 찾지 못함 — 데일리 기록에서만 뽑을 것)"}

[최근 데일리 기록 — 2순위 재료]
{insights_digest(vault, cfg)}

[지난 제안 주제 — 겹치지 말 것]
{history_block}"""

    reply = brain.generate(system, user, cfg)

    topics = []
    for line in reply.split("\n"):
        m = re.match(r"^\s*(\d+)[.)]\s*(.+)$", line.strip())
        if m:
            topics.append(m.group(2).strip())
    if not topics:  # 파싱 실패 시 원문 통째로 1개 취급
        topics = [reply.strip()]

    history = (history + topics)[-40:]
    state.update({"date": datetime.now().strftime("%Y-%m-%d"), "topics": topics, "history": history})
    save_state(state)

    lines = [f"{i}. {t}" for i, t in enumerate(topics, 1)]
    return (
        "🌅 사장님, 오늘의 글감 후보야. 전부 사장님 기록에서 나온 것들이야:\n\n"
        + "\n".join(lines)
        + "\n\n번호로 답해줘 (예: `2번`). 번호 뒤에 경험이나 원고를 덧붙여도 좋고, "
        "다른 주제면 `글써줘 <주제/원고>`라고 해줘. 초안 만들어서 바로 보낼게."
    )


# ── 2단계: 초안 작성 ──

DRAFT_SYSTEM = """너는 사장님의 블로그 초벌 작가다. 아래 문체 예시를 최대한 그대로 흉내내서 블로그 초안을 쓴다.

{style_rules}

규칙:
- 사장님의 실제 기록과 제공된 재료에 있는 경험만 쓴다. 없는 일화를 지어내지 않는다.
- 재료가 부족한 부분은 [여기에 사장님 경험 추가] 표시를 남긴다 — 채우는 건 사장님 몫.
- 분량 800~1500자. 첫 줄은 "# 제목".
- 초안일 뿐이다. 사장님이 고칠 것을 전제로, 뼈대와 흐름을 충실하게."""


def write_draft(cfg, vault: Path, topic: str, extra: str = "") -> str:
    system = DRAFT_SYSTEM.format(style_rules=STYLE_RULES)
    extra_block = f"\n\n[사장님이 직접 준 재료/원고 — 최우선으로 반영]\n{extra}" if extra.strip() else ""
    user = f"""오늘의 주제: {topic}{extra_block}

[사장님 블로그 문체 예시 — 이 목소리 그대로]
{style_examples(vault, cfg)}

[정리된 생각·인사이트 노트 — 사용할 수 있는 사장님의 생각]
{insight_notes(vault, cfg)}

[최근 기록 — 사용할 수 있는 실제 경험]
{insights_digest(vault, cfg)}"""
    return brain.generate(system, user, cfg)


def save_draft(vault: Path, cfg, draft: str) -> Path:
    """초안을 볼트 '블로그 초안' 폴더에 저장 — 옵시디언에서 바로 다듬을 수 있게."""
    folder_name = cfg.get("blog", "draft_folder", fallback="블로그 초안").strip() if cfg.has_section("blog") else "블로그 초안"
    folder = vault / folder_name
    folder.mkdir(parents=True, exist_ok=True)

    first = draft.strip().split("\n")[0].lstrip("# ").strip()
    title = re.sub(r'[\\/:*?"<>|]', "", first)[:40] or "무제"
    path = folder / f"{datetime.now().strftime('%Y-%m-%d')} {title}.md"
    path.write_text(draft, encoding="utf-8")
    return path
