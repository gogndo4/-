#!/usr/bin/env python3
"""참모총장 자가진단 — 설치가 제대로 됐는지, 뭐가 빠졌는지 한 번에 확인

사용법: python advisor/doctor.py
모든 항목이 ✅ 이면 시스템이 돌아갈 준비가 된 것.
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parent))

import brain
import vaultlib

OK, WARN, FAIL = "✅", "⚠️ ", "❌"
problems = 0


def check(label: str, status: str, detail: str = ""):
    global problems
    if status == FAIL:
        problems += 1
    print(f"{status} {label}" + (f" — {detail}" if detail else ""))


def main():
    print("===== 참모총장 자가진단 =====\n")
    cfg = vaultlib.load_config()

    # 1. 볼트
    vault = None
    try:
        vault = vaultlib.find_vault(cfg.get("obsidian", "vault_path", fallback=""))
        check("옵시디언 볼트", OK, str(vault))
    except FileNotFoundError as e:
        check("옵시디언 볼트", FAIL, str(e))

    if vault:
        folder = cfg.get("obsidian", "daily_folder", fallback="Daily").strip()
        daily_dir = vault / folder if folder else vault
        if daily_dir.exists():
            n = len(list(daily_dir.glob("*.md")))
            check("데일리노트 폴더", OK, f"{daily_dir} (노트 {n}개)")
        else:
            check("데일리노트 폴더", WARN, f"{daily_dir} 없음 — config.ini daily_folder 확인")

        target = cfg.get("notes", "target_note", fallback="자존노트.md").strip()
        if vaultlib.find_note_by_name(vault, target):
            check(f"{target}", OK)
        else:
            check(f"{target}", WARN, "볼트에서 못 찾음 — 자존노트 동기화는 건너뛰게 됨")

        tracker = vault / ".obsidian" / "plugins" / "daily-condition-tracker" / "data.json"
        if tracker.exists():
            check("컨디션 트래커 데이터", OK)
        else:
            check("컨디션 트래커 데이터", WARN, "플러그인 미설치 또는 미실행 (없어도 동작함)")

    # 2. Gemini
    try:
        reply = brain.generate("한 단어로만 답하라.", "테스트라고 답해", cfg)
        check("Gemini API", OK, f"응답: {reply[:20]}")
    except Exception as e:
        check("Gemini API", FAIL, str(e)[:150])

    # 3. 디스코드 (토큰·채널 검증 — 메시지는 안 보냄)
    token = cfg.get("discord", "bot_token", fallback="").strip()
    channel = cfg.get("discord", "channel_id", fallback="").strip()
    if not token or not channel:
        check("디스코드 설정", FAIL, "bot_token 또는 channel_id 가 config.ini에 비어 있음")
    else:
        req = urllib.request.Request(
            f"https://discord.com/api/v10/channels/{channel}",
            headers={"Authorization": f"Bot {token}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                info = json.load(resp)
            check("디스코드 봇+채널", OK, f"채널: #{info.get('name', channel)}")
        except urllib.error.HTTPError as e:
            hint = {
                401: "토큰이 잘못됨 (Reset Token 후 새 토큰인지 확인)",
                403: "봇이 이 채널을 볼 권한이 없음 (서버 초대/권한 확인)",
                404: "채널 ID가 잘못됨",
            }.get(e.code, f"HTTP {e.code}")
            check("디스코드 봇+채널", FAIL, hint)
        except urllib.error.URLError as e:
            check("디스코드 봇+채널", FAIL, f"네트워크 오류: {e}")

    # 4. discord.py (봇 상주용)
    try:
        import discord  # noqa: F401
        check("discord.py 라이브러리", OK)
    except ImportError:
        check("discord.py 라이브러리", FAIL, "pip install -r requirements.txt 실행 필요")

    print()
    if problems == 0:
        print("===== 모든 검사 통과! python advisor\\daily_briefing.py --force 로 첫 인사를 보내보세요 =====")
    else:
        print(f"===== ❌ {problems}개 문제 발견 — 위 항목을 해결한 뒤 다시 실행하세요 =====")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
