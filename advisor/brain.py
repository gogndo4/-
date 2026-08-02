#!/usr/bin/env python3
"""Gemini 무료 API 호출 (표준 라이브러리만 사용, 추가 설치 불필요)"""

import json
import os
import urllib.error
import urllib.request

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"


def _api_key(cfg) -> str:
    key = ""
    if cfg.has_section("gemini"):
        key = cfg.get("gemini", "api_key", fallback="").strip()
    key = key or os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "Gemini API 키가 없습니다. https://aistudio.google.com/apikey 에서 무료 발급 후 "
            "config.ini [gemini] api_key 에 넣어주세요."
        )
    return key


def _models(cfg) -> list[str]:
    primary = cfg.get("gemini", "model", fallback="gemini-2.5-flash").strip()
    fallback = cfg.get("gemini", "fallback_model", fallback="gemini-2.5-flash-lite").strip()
    models = [primary]
    if fallback and fallback != primary:
        models.append(fallback)
    return models


def generate(system_text: str, contents: list[dict] | str, cfg) -> str:
    """contents: 문자열(단일 질문) 또는 [{"role": "user"|"model", "text": ...}] 대화 이력."""
    key = _api_key(cfg)
    if isinstance(contents, str):
        contents = [{"role": "user", "text": contents}]

    body = {
        "system_instruction": {"parts": [{"text": system_text}]},
        "contents": [
            {"role": c["role"], "parts": [{"text": c["text"]}]} for c in contents
        ],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2000},
    }
    payload = json.dumps(body).encode("utf-8")

    models = _models(cfg)
    last_err = None
    for model in models:
        req = urllib.request.Request(
            API_URL.format(model=model, key=key),
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.load(resp)
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts).strip()
            if text:
                return text
            last_err = RuntimeError("Gemini가 빈 응답을 반환했습니다.")
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", errors="replace")[:300]
            except OSError:
                pass
            last_err = RuntimeError(f"Gemini API 오류 {e.code} (model={model}): {detail}")
            # 무료 한도 초과(429)나 서버 오류면 다음 모델로 폴백
            if e.code not in (429, 500, 503):
                break
        except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError) as e:
            last_err = RuntimeError(f"Gemini 호출 실패 (model={model}): {e}")

    raise last_err
