#!/usr/bin/env python3
"""아침 글감 발송 — 매일 08:00, 사장님 기록에서 나온 블로그 주제 5개를 디스코드로

사용법:
  python advisor/blog_topics.py            # 오늘 아직 안 보냈으면 발송
  python advisor/blog_topics.py --force    # 재발송
  python advisor/blog_topics.py --dry-run  # 발송 없이 출력만
"""

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parent))

import blog
import discord_send
import vaultlib

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(SCRIPT_DIR / "advisor.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("blog-topics")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--vault", default="")
    args = parser.parse_args()

    cfg = vaultlib.load_config()
    today = datetime.now().strftime("%Y-%m-%d")

    state = blog.load_state()
    if not args.force and not args.dry_run and state.get("date") == today and state.get("sent"):
        log.info("오늘(%s) 글감은 이미 발송됨.", today)
        return

    vault = vaultlib.find_vault(args.vault or cfg.get("obsidian", "vault_path", fallback=""))

    try:
        text = blog.suggest_topics(cfg, vault)
    except Exception as e:
        log.error("글감 생성 실패: %s", e)
        if not args.dry_run:
            try:
                discord_send.send(cfg, f"⚠️ 오늘 글감 생성에 실패했어, 사장님. 원인: {e}")
            except Exception as e2:
                log.error("실패 알림 발송도 실패: %s", e2)
        sys.exit(1)

    if args.dry_run:
        print(text)
        return

    discord_send.send(cfg, text)
    state = blog.load_state()
    state["sent"] = True
    blog.save_state(state)
    log.info("글감 발송 완료")


if __name__ == "__main__":
    main()
