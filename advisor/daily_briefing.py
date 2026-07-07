#!/usr/bin/env python3
"""매일 아침 참모총장 브리핑 — 볼트 수집 → Gemini 분석 → 디스코드 발송

사용법:
  python advisor/daily_briefing.py            # 오늘 아직 안 보냈으면 발송
  python advisor/daily_briefing.py --force    # 이미 보냈어도 다시 발송
  python advisor/daily_briefing.py --dry-run  # 발송 없이 프롬프트/결과만 출력
"""

import argparse
import json
import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent
STATE_FILE = SCRIPT_DIR / "advisor_state.json"
LOG_FILE = SCRIPT_DIR / "advisor.log"

sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(REPO_DIR))

import brain
import collect
import discord_send
import memory
import persona
import vaultlib

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


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def run_sync_scripts():
    """기존 동기화 파이프라인(자존노트·출력노트)을 먼저 돌린다. 실패해도 브리핑은 계속."""
    for script in ["sync_esteem.py", "sync_output.py"]:
        path = REPO_DIR / script
        if not path.exists():
            continue
        try:
            r = subprocess.run(
                [sys.executable, str(path)], capture_output=True, text=True, timeout=120
            )
            log.info("%s 실행 (exit %d)", script, r.returncode)
        except (subprocess.SubprocessError, OSError) as e:
            log.warning("%s 실행 실패: %s", script, e)


def gap_note(state: dict) -> str:
    """지난 브리핑이 언제였는지 — 시스템이 며칠 죽어 있었다면 그 사실을 브리핑에서 직접 알리게 한다."""
    last = state.get("last_briefing_date")
    if not last:
        return (
            "참고: 오늘이 사장님과의 첫 인사다. 참모총장이자 친구로서 짧게 자기소개하고, "
            "앞으로 매일 저녁 먼저 말을 걸 거라는 것과 '완료/상황/적어줘/기억해' 명령을 한 줄로 소개하라."
        )
    try:
        days = (datetime.now().date() - datetime.strptime(last, "%Y-%m-%d").date()).days
    except ValueError:
        return ""
    if days >= 2:
        return (
            f"참고: 마지막 브리핑이 {days}일 전({last})이었다. 브리핑 시스템이 그동안 실행되지 못했다는 "
            "사실을 먼저 솔직하게 알리고 시작하라 (PC가 꺼져 있었을 가능성이 높다)."
        )
    return ""


def build_briefing(cfg, vault, state, dry_run: bool) -> str:
    ctx = collect.gather_context(cfg, vault)
    ctx["memory"] = memory.read(vault, cfg)

    name = cfg.get("advisor", "name", fallback="참모") .strip()
    system = persona.briefing_system(name)
    user = persona.briefing_user(ctx, gap_note(state))

    if dry_run:
        print("=" * 30, "SYSTEM PROMPT", "=" * 30)
        print(system)
        print("=" * 30, "USER PROMPT", "=" * 30)
        print(user)
        return ""

    return brain.generate(system, user, cfg)


def archive_briefing(vault, cfg, text: str):
    """브리핑 사본을 볼트에 남긴다 (기록용, 옵시디언에서 검색 가능)."""
    name = cfg.get("advisor", "briefing_archive", fallback="브리핑 아카이브.md").strip()
    path = vaultlib.find_note_by_name(vault, name)
    if not path:
        anchor = vaultlib.find_note_by_name(
            vault, cfg.get("notes", "target_note", fallback="자존노트.md").strip()
        )
        path = (anchor.parent if anchor else vault) / name
        path.write_text("# 브리핑 아카이브\n", encoding="utf-8")
    old = path.read_text(encoding="utf-8")
    stamp = datetime.now().strftime("%Y.%m.%d %H:%M")
    path.write_text(f"{old.rstrip()}\n\n---\n\n## {stamp}\n\n{text}\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="발송 없이 프롬프트만 출력")
    parser.add_argument("--force", action="store_true", help="오늘 이미 보냈어도 다시 발송")
    parser.add_argument("--vault", default="", help="볼트 경로 직접 지정 (테스트용)")
    args = parser.parse_args()

    cfg = vaultlib.load_config()
    today = datetime.now().strftime("%Y-%m-%d")
    state = load_state()

    if not args.force and not args.dry_run and state.get("last_briefing_date") == today:
        log.info("오늘(%s) 브리핑은 이미 발송됨. --force 로 재발송 가능.", today)
        return

    vault_hint = args.vault or cfg.get("obsidian", "vault_path", fallback="")
    vault = vaultlib.find_vault(vault_hint)
    log.info("볼트: %s", vault)

    if not args.dry_run:
        run_sync_scripts()

    try:
        text = build_briefing(cfg, vault, state, args.dry_run)
    except Exception as e:
        log.error("브리핑 생성 실패: %s", e)
        # 두뇌가 실패해도 침묵하지 않는다 — 실패 사실 자체를 디스코드로 알림
        try:
            discord_send.send(cfg, f"⚠️ 오늘 브리핑 생성에 실패했어. 원인: {e}")
        except Exception as e2:
            log.error("실패 알림 발송도 실패: %s", e2)
        sys.exit(1)

    if args.dry_run:
        return

    discord_send.send(cfg, text)
    log.info("브리핑 발송 완료 (%d자)", len(text))

    try:
        archive_briefing(vault, cfg, text)
    except OSError as e:
        log.warning("아카이브 저장 실패: %s", e)

    state["last_briefing_date"] = today
    save_state(state)


if __name__ == "__main__":
    main()
