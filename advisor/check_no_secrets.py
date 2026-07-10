#!/usr/bin/env python3
"""git 커밋 전 안전장치 — config.ini 에 실제 비밀키가 채워진 채로 커밋되는 걸 막는다.

원격 디스패치(폰코딩 등)로 설치할 때, 다른 세션이 실수로 config.ini 에
직접 키를 써넣고 git add -A 를 해버릴 수 있어 만든 방어선.

사용법: python advisor/check_no_secrets.py   (문제 있으면 exit 1)
"""

import configparser
import sys
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent.parent


def main():
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read(REPO_DIR / "config.ini", encoding="utf-8-sig")

    leaks = []
    if cfg.has_option("gemini", "api_key") and cfg.get("gemini", "api_key").strip():
        leaks.append("[gemini] api_key")
    if cfg.has_option("discord", "bot_token") and cfg.get("discord", "bot_token").strip():
        leaks.append("[discord] bot_token")

    if leaks:
        print("❌ config.ini 에 실제 비밀키가 들어있습니다 — 절대 커밋/푸시하지 마세요:")
        for l in leaks:
            print(f"   - {l}")
        print("   값을 지우고 대신 환경변수(GEMINI_API_KEY, DISCORD_BOT_TOKEN)를 쓰세요.")
        sys.exit(1)

    print("✅ config.ini 에 노출된 비밀키 없음")


if __name__ == "__main__":
    main()
