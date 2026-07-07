#!/usr/bin/env python3
"""
Obsidian 데일리노트 → 스레드(Threads) 초안 자동 생성 스크립트

최근 데일리노트에 내가 직접 쓴 기록만 재료로 삼아,
Claude 가 잘 터지는 스레드 형식의 초안 여러 개를 만들어
볼트의 '스레드 초안' 폴더에 저장합니다.

기록이 없는 날은 초안도 없습니다. (지어낸 글 금지 — 그게 이 시스템의 존재 이유)

매일 1회 실행하세요. config.ini 의 [threads] 섹션을 읽어 동작합니다.
Claude Code CLI(claude)가 설치되어 있어야 합니다: https://claude.com/claude-code
"""

import configparser
import re
import subprocess
import sys
import logging
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOG_FILE = SCRIPT_DIR / "draft_threads.log"

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
    cfg.read(cfg_path, encoding="utf-8-sig")
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


def strip_section(text: str, heading: str) -> str:
    """이미 발행된 '출력' 섹션 등은 재료에서 제외합니다."""
    lines = text.split("\n")
    result = []
    skipping = False
    for line in lines:
        if re.match(rf"^#{{1,6}}\s+{re.escape(heading)}\s*$", line):
            skipping = True
            continue
        if skipping and re.match(r"^#{1,6}\s+", line):
            skipping = False
        if not skipping:
            result.append(line)
    return "\n".join(result)


def gather_material(
    vault: Path, daily_folder: str, daily_fmt: str, lookback_days: int, exclude_heading: str
) -> str:
    """최근 N일 데일리노트에서 재료를 수집합니다."""
    daily_dir = vault / daily_folder if daily_folder else vault
    if not daily_dir.exists():
        log.error("데일리노트 폴더를 찾을 수 없습니다: %s", daily_dir)
        sys.exit(1)

    blocks = []
    today = datetime.now().date()
    for i in range(lookback_days, 0, -1):
        d = today - timedelta(days=i)
        note = daily_dir / f"{d.strftime(daily_fmt)}.md"
        if not note.exists():
            continue
        text = note.read_text(encoding="utf-8").strip()
        if exclude_heading:
            text = strip_section(text, exclude_heading)
        # 프론트매터 제거
        text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.DOTALL).strip()
        if text:
            blocks.append(f"### {d.strftime('%Y-%m-%d')} 기록\n{text}")
    return "\n\n".join(blocks)


def build_prompt(material: str, num_drafts: int) -> str:
    return f"""너는 '내 기록 → 스레드(Threads) 초안' 변환 조수다.

아래 <기록>은 내가 옵시디언 데일리노트에 직접 쓴 글이다.
이 기록에 실제로 있는 경험·생각·문장만 재료로 사용해라.

배경: 나는 육군 복무 중이고(전역 2027.07.18), 입대 전 「하루의 밀도」라는
필사 챌린지 커뮤니티를 운영했다. 스레드는 기록·꾸준함·자기이해를 주제로 키우려 한다.

절대 규칙:
1. 기록에 없는 사실·경험·숫자를 지어내지 마라. 일반론적 조언 글 금지.
2. 내 문장을 최대한 그대로 살려라. 매끈한 글보다 내 말투가 우선이다.
3. 각 초안 끝에 어떤 기록에서 나왔는지 `[재료: 원문 인용]` 을 표시해라.
4. 해시태그 금지, 이모지는 초안당 최대 1개.
5. 한 초안은 500자 이내. 첫 문장이 훅이어야 한다 (스크롤을 멈추게 하는 문장).

서로 다른 형식으로 초안 {num_drafts}개를 작성해라. 형식은 아래에서 골라라:
- 고백형: 솔직한 실패·현타 고백 + 그 끝의 작은 깨달음
- 반전형: 통념을 부정하는 첫 문장 + 내 경험으로 반박
- 구체수치형: 숫자로 시작 (복무 D-xxx, 기록 N일째, N번째 등)
- 질문형: 독자에게 던지는 질문 + 내 기록에서 나온 답
- 한 장면형: 그날의 구체적인 순간 묘사 + 마지막 한 줄 통찰

출력 형식 (마크다운, 다른 말 없이 초안만):
## 초안 1 — (형식명)
(본문)
[재료: ...]

## 초안 2 — ...

<기록>
{material}
</기록>"""


def call_claude(claude_cmd: str, prompt: str, timeout_sec: int = 600) -> str | None:
    """Claude Code CLI 를 헤드리스로 호출합니다. 실패하면 None."""
    try:
        result = subprocess.run(
            [claude_cmd, "-p"],
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout_sec,
        )
    except FileNotFoundError:
        log.error("'%s' 명령을 찾을 수 없습니다. Claude Code CLI 설치를 확인하세요.", claude_cmd)
        return None
    except subprocess.TimeoutExpired:
        log.error("Claude 호출이 %d초 안에 끝나지 않았습니다.", timeout_sec)
        return None
    if result.returncode != 0:
        log.error("Claude 호출 실패 (exit %d): %s", result.returncode, result.stderr[:500])
        return None
    return result.stdout.strip()


def main():
    cfg = load_config()
    obs = cfg["obsidian"]
    th = cfg["threads"] if cfg.has_section("threads") else {}

    vault = find_vault(obs.get("vault_path", "").strip())
    daily_folder = obs.get("daily_folder", "Daily").strip()
    daily_fmt = obs.get("daily_format", "%Y-%m-%d").strip()

    draft_folder = th.get("draft_folder", "스레드 초안").strip()
    lookback_days = int(th.get("lookback_days", "3"))
    num_drafts = int(th.get("num_drafts", "3"))
    claude_cmd = th.get("claude_command", "claude").strip()
    exclude_heading = th.get("exclude_heading", "출력").strip()

    today_str = datetime.now().strftime(daily_fmt)
    out_dir = vault / draft_folder
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{today_str}.md"

    if out_path.exists():
        log.info("[SKIP] 오늘 초안이 이미 있습니다: %s", out_path)
        return

    material = gather_material(vault, daily_folder, daily_fmt, lookback_days, exclude_heading)
    if not material:
        log.info("최근 %d일 데일리노트에 재료가 없습니다. 초안을 만들지 않습니다.", lookback_days)
        log.info("(기록이 없으면 초안도 없다 — 오늘 밤 데일리노트 한 줄이 내일 초안이 됩니다)")
        return

    log.info("재료 %d자 수집 완료. Claude 에게 초안 %d개 요청...", len(material), num_drafts)
    prompt = build_prompt(material, num_drafts)
    drafts = call_claude(claude_cmd, prompt)

    if not drafts:
        # 실패 시 프롬프트를 볼트에 저장 → 폰의 Claude 앱에서 직접 붙여넣기 가능
        fallback = out_dir / f"{today_str}.프롬프트.md"
        fallback.write_text(
            "# Claude 호출 실패 — 아래 내용을 폰 Claude 앱에 붙여넣으세요\n\n```\n"
            + prompt + "\n```\n",
            encoding="utf-8",
        )
        log.warning("초안 생성 실패. 수동용 프롬프트 저장: %s", fallback)
        sys.exit(1)

    content = "\n".join([
        f"# 스레드 초안 {today_str}",
        "",
        "> 이 초안의 재료는 전부 **네가 직접 쓴 기록**이다. Claude 는 편집만 했다.",
        "> 하나 골라서 **네 말로 고친 뒤** 발행하고, 오늘 데일리노트 `## 출력` 에 한 줄 남겨라.",
        "> 셋 다 별로면 버려도 된다. 고르고 버리는 것도 저자의 일이다.",
        "",
        "---",
        "",
        drafts,
        "",
    ])
    out_path.write_text(content, encoding="utf-8")
    log.info("[OK] 스레드 초안 저장 완료: %s", out_path)


if __name__ == "__main__":
    main()
