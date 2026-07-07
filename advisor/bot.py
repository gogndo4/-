#!/usr/bin/env python3
"""참모총장 상주 봇 — 디스코드 채널에서 실시간 대화 (discord.py 필요: pip install -r requirements.txt)

사용법: python advisor/bot.py   (PC 켜져 있는 동안 상주. setup_advisor.ps1 이 로그인 시 자동 시작 등록)
"""

import asyncio
import logging
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parent))

import discord

import brain
import collect
import discord_send
import memory
import mission
import persona
import vaultlib

LOG_FILE = SCRIPT_DIR / "bot.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("advisor-bot")

HISTORY_LIMIT = 25  # 대화 맥락으로 쓸 최근 채널 메시지 수


class AdvisorBot(discord.Client):
    def __init__(self, cfg, channel_id: int, **kwargs):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents, **kwargs)
        self.cfg = cfg
        self.channel_id = channel_id
        self.advisor_name = cfg.get("advisor", "name", fallback="참모").strip()

    async def on_ready(self):
        log.info("봇 로그인: %s (채널 %d 감시 중)", self.user, self.channel_id)

    async def on_message(self, message: discord.Message):
        if message.author.bot or message.channel.id != self.channel_id:
            return
        content = message.content.strip()
        if not content:
            return

        try:
            async with message.channel.typing():
                history = await self.fetch_history(message.channel)
                reply = await asyncio.to_thread(self.handle, content, history)
        except Exception as e:
            log.exception("응답 생성 실패")
            reply = f"⚠️ 지금 생각회로에 문제가 생겼어: {e}"

        for chunk in discord_send._chunks(reply):
            await message.channel.send(chunk)

    def handle(self, content: str, history: list[dict]) -> str:
        vault = vaultlib.find_vault(self.cfg.get("obsidian", "vault_path", fallback=""))

        # "기억해 ..." → 장기 기억 노트에 저장
        if content.startswith("기억해"):
            note = content[len("기억해"):].strip(" :,-")
            if note:
                path = memory.remember(vault, self.cfg, note)
                return f"✅ 기억했어 — `{path.name}`에 적어뒀어: \"{note}\""

        # "적어줘/메모 ..." → 오늘 데일리노트에 대필
        for prefix in ("적어줘", "적어", "메모"):
            if content.startswith(prefix):
                note = content[len(prefix):].strip(" :,-")
                if note:
                    path = memory.write_daily(vault, self.cfg, note)
                    return f"📝 오늘 데일리노트(`{path.name}`)에 옮겨 적었어: \"{note}\""
                break

        # "상황" → 코드가 계산한 주간 미션 상태 그대로
        if content in ("상황", "상태", "미션"):
            return mission.status_text(mission.week_state(vault, self.cfg))

        # "목표" → 목표 노트 원문
        if content == "목표":
            return f"🎯 현재 목표 노트 (`목표.md` — 옵시디언에서 수정 가능):\n\n{mission.read_goals(vault, self.cfg)}"

        # "도움말" → 명령 목록
        if content in ("도움말", "명령어", "help"):
            return (
                "🫡 참모총장 명령어:\n"
                "- `상황` — 이번 주 미션 상태 (출력·연속 주·전역까지 기회)\n"
                "- `완료 <내용>` — 출력 기록, 미션 즉시 달성 처리\n"
                "- `적어줘 <내용>` — 오늘 데일리노트에 대필\n"
                "- `기억해 <내용>` — 장기 기억에 영구 저장\n"
                "- `목표` — 목표 노트 보기\n"
                "그 외엔 그냥 편하게 말 걸면 돼, 사장님. 매일 밤 대화는 자동으로 기억에 적립돼."
            )

        # "완료 ..." → 오늘 데일리노트 '출력' 섹션에 기록 (미션 상태 즉시 반영)
        if content.startswith("완료"):
            note = content[len("완료"):].strip(" :,-")
            if note:
                mission.log_output(vault, self.cfg, note)
                state = mission.week_state(vault, self.cfg)
                return (
                    f"🎉 출력 기록 완료: \"{note}\"\n"
                    f"이번 주 미션 달성! 연속 출력 {state['streak_weeks'] + 1}주째야."
                )

        # 볼트 맥락 + 채널 대화 이력으로 응답
        ctx = collect.gather_context(self.cfg, vault)
        ctx["memory"] = memory.read(vault, self.cfg)
        system = persona.chat_system(self.advisor_name, ctx)
        return brain.generate(system, history, self.cfg)

    async def fetch_history(self, channel) -> list[dict]:
        msgs = [m async for m in channel.history(limit=HISTORY_LIMIT)]
        msgs.reverse()
        contents = []
        for m in msgs:
            text = m.content.strip()
            if not text:
                continue
            role = "model" if m.author.bot else "user"
            # Gemini contents 는 user/model 교대가 아니어도 되지만 연속 같은 role 은 병합
            if contents and contents[-1]["role"] == role:
                contents[-1]["text"] += f"\n{text}"
            else:
                contents.append({"role": role, "text": text})
        if not contents or contents[-1]["role"] != "user":
            contents.append({"role": "user", "text": "(방금 메시지에 이어서 답해줘)"})
        return contents


def main():
    cfg = vaultlib.load_config()
    token, channel_id = discord_send.credentials(cfg)
    bot = AdvisorBot(cfg, int(channel_id))
    bot.run(token, log_handler=None)


if __name__ == "__main__":
    main()
