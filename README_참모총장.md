# 참모총장 AI — 설치와 사용법

옵시디언에 쌓이는 내 기록(데일리노트·컨디션·자존노트·출력)을 매일 아침 AI가 읽고,
**디스코드로 먼저 말을 거는** 개인 참모총장 시스템.

```
밤: 데일리노트에 평소처럼 기록 (폰)
        ↓
아침 (PC 켜지면 자동):
  자존노트/출력노트 동기화 → Gemini가 기록 전체 분석 → 디스코드 채널로 브리핑 발송
        ↓
낮/저녁: 같은 채널에서 참모총장과 자유롭게 대화 (봇이 상주)
  "기억해 ..."라고 말하면 볼트의 '참모총장 메모리.md'에 영구 저장
```

- **비용 0원**: Google Gemini 무료 API 사용 (개인용으로 충분한 무료 한도)
- **기억**: 장기 기억은 볼트 안 `참모총장 메모리.md`에 마크다운으로 저장 — 옵시디언에서 직접 보고 고칠 수 있음
- **브리핑 사본**: `브리핑 아카이브.md`에 자동 보관
- **침묵 금지 원칙**: 브리핑 생성이 실패하면 실패했다는 사실 자체를 디스코드로 알림. 2일 이상 시스템이 죽어 있었으면 브리핑 첫머리에 스스로 고백함.

---

## 최초 설정 (한 번만, 약 15분)

### 1. Gemini 무료 API 키 발급 (2분)

1. https://aistudio.google.com/apikey 접속 (구글 계정 로그인)
2. **Create API key** 클릭 → 키 복사
3. `config.ini`의 `[gemini]` → `api_key = ` 뒤에 붙여넣기

### 2. 디스코드 봇 만들기 (5분)

1. https://discord.com/developers/applications → **New Application** → 이름: `참모총장`
2. 왼쪽 메뉴 **Bot** → **Reset Token** → 토큰 복사 → `config.ini`의 `bot_token = ` 에 붙여넣기
3. 같은 Bot 페이지에서 **MESSAGE CONTENT INTENT** 스위치 켜기 (필수!)
4. 왼쪽 메뉴 **OAuth2 → URL Generator**:
   - SCOPES: `bot` 체크
   - BOT PERMISSIONS: `View Channels`, `Send Messages`, `Read Message History` 체크
   - 아래 생성된 URL을 브라우저에 붙여넣기 → 내 서버 선택 → 승인
5. 디스코드 앱: 설정 → 고급 → **개발자 모드** 켜기
6. 참모총장 채널(폰코딩 채널) 우클릭 → **ID 복사하기** → `config.ini`의 `channel_id = ` 에 붙여넣기

### 3. 설치 및 등록 (PC에서, 3분)

PowerShell을 열고 이 폴더에서:

```powershell
pip install -r requirements.txt   # 디스코드 봇 라이브러리
python advisor\daily_briefing.py --force   # 첫 브리핑 테스트 발송
.\setup_advisor.ps1               # 자동 실행 등록 (관리자 권한 권장)
```

디스코드 채널에 브리핑이 도착하면 성공.

### 4. 기존 시스템 진단 (선택, 2분)

예전에 만들어둔 자동화들이 어디서 돌아가는지 모르겠다면:

```powershell
.\diagnose_system.ps1
```

바탕화면에 생기는 `시스템진단리포트.txt` 내용을 클로드에게 붙여넣으면 전체 분석을 받을 수 있다.

---

## 매일 사용법

| 언제 | 무엇을 | 어디서 |
|---|---|---|
| 밤 | 데일리노트 기록 (자존노트·컨디션·출력 섹션 포함, 평소 습관 그대로) | 폰 옵시디언 |
| 아침 | 도착한 브리핑 읽기 → 채널에서 바로 답장/토의 | 디스코드 |
| 수시 | 고민·결정·아이디어를 채널에 던지기 → 참모가 내 기록 기반으로 답함 | 디스코드 |
| 수시 | `기억해 <내용>` → 장기 기억에 저장 | 디스코드 |

## 자주 묻는 것

**Q. 브리핑이 안 왔어요**
→ PC가 켜져 있어야 한다. 켠 직후 로그인 트리거로 자동 발송된다 (같은 날 중복 발송은 스킵).
수동 실행: `python advisor\daily_briefing.py --force`
로그 확인: `advisor\advisor.log`

**Q. 봇이 대답을 안 해요**
→ ① MESSAGE CONTENT INTENT 켰는지 ② channel_id가 맞는지 ③ `advisor\bot.log` 확인.
수동 시작: `python advisor\bot.py`

**Q. 무료 한도는?**
→ Gemini 무료 티어는 하루 수백 회 요청까지 가능. 브리핑 1회 + 대화 수십 회는 여유. 한도 초과 시 자동으로 라이트 모델로 폴백.

**Q. PC를 며칠 못 켜면?**
→ 다음에 켤 때 브리핑이 오고, 공백이 있었다는 사실을 참모가 먼저 알려준다.

## 파일 구조

```
advisor/
  daily_briefing.py   아침 브리핑 파이프라인 (수집→분석→발송→아카이브)
  bot.py              디스코드 상주 대화 봇
  collect.py          볼트에서 맥락 수집 (데일리노트·트래커·자존·출력·자기정보)
  persona.py          참모총장 페르소나·프롬프트
  brain.py            Gemini API 호출 (무료)
  discord_send.py     디스코드 발송
  memory.py           장기 기억 (볼트 노트)
  vaultlib.py         공용 유틸
setup_advisor.ps1     윈도우 자동 실행 등록
diagnose_system.ps1   흩어진 기존 자동화 전수 조사
```

기존 자존노트/출력/스레드 파이프라인은 그대로 유지되며, 브리핑이 실행될 때 자동으로 함께 돌아간다.
