# 참모총장 원클릭 설치기
# 사용법: install.bat 더블클릭 (또는 PowerShell에서 .\setup_advisor.ps1)
#
# 하는 일: ① Gemini 키·디스코드 토큰·채널 ID 입력받아 config.ini 에 저장
#          ② 필요한 라이브러리 설치  ③ 자동 실행 작업 2개 등록 (절전 중에도 깨어나 실행)
#          ④ 첫 브리핑 즉시 테스트 발송

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir "config.ini"

Write-Host "===== 참모총장 설치를 시작합니다 =====" -ForegroundColor Cyan
Write-Host ""

# ── 0. Python 확인 ──
$PythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonPath) { $PythonPath = (Get-Command python3 -ErrorAction SilentlyContinue).Source }
if (-not $PythonPath) {
    Write-Host "[ERROR] Python이 없습니다. https://python.org 에서 설치(Add to PATH 체크!) 후 다시 실행해주세요." -ForegroundColor Red
    Read-Host "Enter 키를 누르면 종료"; exit 1
}
$PythonwPath = Join-Path (Split-Path $PythonPath) "pythonw.exe"
if (-not (Test-Path $PythonwPath)) { $PythonwPath = $PythonPath }
Write-Host "Python: $PythonPath"

# ── 1. 키 입력 → config.ini 저장 ──
$cfg = Get-Content $ConfigPath -Raw -Encoding UTF8

function Fill-ConfigValue([string]$content, [string]$key, [string]$prompt) {
    if ($content -match "(?m)^$key\s*=\s*\S") {
        Write-Host "  $key : 이미 설정됨 (건너뜀)" -ForegroundColor DarkGray
        return $content
    }
    $value = Read-Host "  $prompt"
    if ($value.Trim()) {
        return $content -replace "(?m)^$key\s*=\s*$", "$key = $($value.Trim())"
    }
    Write-Host "  (비워둠 — 나중에 config.ini 에서 직접 입력 가능)" -ForegroundColor Yellow
    return $content
}

Write-Host ""
Write-Host "[1/4] 키 설정" -ForegroundColor Cyan
$cfg = Fill-ConfigValue $cfg "api_key"    "Gemini API 키 붙여넣기 (aistudio.google.com/apikey)"
$cfg = Fill-ConfigValue $cfg "bot_token"  "디스코드 봇 토큰 붙여넣기 (discord.com/developers)"
$cfg = Fill-ConfigValue $cfg "channel_id" "디스코드 채널 ID 붙여넣기 (채널 우클릭 > ID 복사)"
Set-Content -Path $ConfigPath -Value $cfg -Encoding UTF8 -NoNewline

# ── 2. 라이브러리 설치 ──
Write-Host ""
Write-Host "[2/4] 라이브러리 설치 (discord.py)" -ForegroundColor Cyan
& $PythonPath -m pip install -q -r (Join-Path $ScriptDir "requirements.txt")

# ── 3. 자동 실행 등록 ──
Write-Host ""
Write-Host "[3/4] 자동 실행 등록" -ForegroundColor Cyan

# 브리핑: 매일 08:00 (절전 중이면 깨어나서 실행) + 로그인 시 (같은 날 중복 발송은 자동 스킵)
$BriefingScript = Join-Path $ScriptDir "advisor\daily_briefing.py"
$Action1 = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$BriefingScript`"" -WorkingDirectory $ScriptDir
$Triggers1 = @(
    (New-ScheduledTaskTrigger -Daily -At "08:00"),
    (New-ScheduledTaskTrigger -AtLogOn)
)
$Settings1 = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName "참모총장브리핑" -Action $Action1 -Trigger $Triggers1 -Settings $Settings1 `
    -Description "매일 아침 옵시디언 기록 기반 AI 브리핑을 디스코드로 발송" -Force | Out-Null
Write-Host "  [OK] '참모총장브리핑' — 매일 08:00 (절전 해제 포함) + 로그인 시" -ForegroundColor Green

# 대화 봇: 로그인 시 상주
$BotScript = Join-Path $ScriptDir "advisor\bot.py"
$Action2 = New-ScheduledTaskAction -Execute $PythonwPath -Argument "`"$BotScript`"" -WorkingDirectory $ScriptDir
$Trigger2 = New-ScheduledTaskTrigger -AtLogOn
$Settings2 = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 30) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "참모총장봇" -Action $Action2 -Trigger $Trigger2 -Settings $Settings2 `
    -Description "디스코드 참모총장 대화 봇 (PC 켜져 있는 동안 상주)" -Force | Out-Null
Write-Host "  [OK] '참모총장봇' — 로그인 시 자동 시작" -ForegroundColor Green

# ── 4. 첫 브리핑 테스트 ──
Write-Host ""
Write-Host "[4/4] 첫 브리핑 테스트 발송" -ForegroundColor Cyan
& $PythonPath $BriefingScript --force
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "===== 설치 완료! 디스코드 채널을 확인해보세요 =====" -ForegroundColor Green
    Start-ScheduledTask -TaskName "참모총장봇" -ErrorAction SilentlyContinue
    Write-Host "대화 봇도 시작했습니다. 채널에 말을 걸어보세요."
} else {
    Write-Host ""
    Write-Host "[!] 브리핑 발송에 실패했습니다. 위 오류 메시지와 advisor\advisor.log 를 확인해주세요." -ForegroundColor Yellow
    Write-Host "    키를 다시 넣으려면 config.ini 를 메모장으로 열어 수정 후 install.bat 재실행."
}
Write-Host ""
Read-Host "Enter 키를 누르면 종료"
