#!/usr/bin/env python3
"""디스코드 채널로 메시지 발송 (봇 토큰 REST 호출 — 봇 상주 없이도 발송 가능)"""

import json
import os
import time
import urllib.error
import urllib.request

API = "https://discord.com/api/v10/channels/{channel_id}/messages"
MAX_LEN = 1900  # 디스코드 한 메시지 2000자 제한 여유분


def credentials(cfg) -> tuple[str, str]:
    token = ""
    channel = ""
    if cfg.has_section("discord"):
        token = cfg.get("discord", "bot_token", fallback="").strip()
        channel = cfg.get("discord", "channel_id", fallback="").strip()
    token = token or os.environ.get("DISCORD_BOT_TOKEN", "").strip()
    channel = channel or os.environ.get("DISCORD_CHANNEL_ID", "").strip()
    if not token or not channel:
        raise RuntimeError(
            "디스코드 봇 토큰/채널 ID가 없습니다. README_참모총장.md 의 설정 순서를 따라주세요."
        )
    return token, channel


def _chunks(text: str) -> list[str]:
    if len(text) <= MAX_LEN:
        return [text]
    chunks, current = [], ""
    for line in text.split("\n"):
        while len(line) > MAX_LEN:  # 한 줄 자체가 너무 긴 경우
            chunks.append(line[:MAX_LEN])
            line = line[MAX_LEN:]
        if len(current) + len(line) + 1 > MAX_LEN:
            chunks.append(current)
            current = line
        else:
            current = f"{current}\n{line}" if current else line
    if current:
        chunks.append(current)
    return chunks


def send(cfg, text: str):
    token, channel_id = credentials(cfg)
    for chunk in _chunks(text):
        payload = json.dumps({"content": chunk}).encode("utf-8")
        req = urllib.request.Request(
            API.format(channel_id=channel_id),
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bot {token}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"디스코드 발송 실패 {e.code}: {detail}")
        time.sleep(0.5)  # 연속 발송 rate limit 여유
