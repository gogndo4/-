# 참모총장 자동 실행 등록 스크립트
# PowerShell을 관리자 권한으로 열고 이 폴더에서 실행:
#   .\setup_advisor.ps1
#
# 등록되는 작업 2개:
#   1. 참모총장브리핑 — 매일 08:00 + PC 로그인 시 실행 (같은 날 중복 발송은 스크립트가 알아서 스킵)
#   2. 참모총장봇     — PC 로그인 시 시작, 켜져 있는 동안 디스코드에서 상시 대화

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$PythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonPath) { $PythonPath = (Get-Command python3 -ErrorAction SilentlyContinue).Source }
if (-not $PythonPath) {
    Write-Host "[ERROR] Python을 찾을 수 없습니다. https://python.org 에서 설치 후 다시 실행해주세요." -ForegroundColor Red
    exit 1
}
# 봇은 콘솔 창 없이 백그라운드로 (pythonw)
$PythonwPath = Join-Path (Split-Path $PythonPath) "pythonw.exe"
if (-not (Test-Path $PythonwPath)) { $PythonwPath = $PythonPath }

Write-Host "Python: $PythonPath"

# ── 1. 아침 브리핑 (매일 08:00 + 로그인 시) ──
$BriefingScript = Join-Path $ScriptDir "advisor\daily_briefing.py"
$Action1 = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$BriefingScript`"" -WorkingDirectory $ScriptDir
$Triggers1 = @(
    (New-ScheduledTaskTrigger -Daily -At "08:00"),
    (New-ScheduledTaskTrigger -AtLogOn)
)
$Settings1 = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName "참모총장브리핑" -Action $Action1 -Trigger $Triggers1 -Settings $Settings1 `
    -Description "매일 아침 옵시디언 기록 기반 AI 브리핑을 디스코드로 발송" -Force | Out-Null
Write-Host "[OK] '참모총장브리핑' 등록 완료 (매일 08:00 + 로그인 시)" -ForegroundColor Green

# ── 2. 대화 봇 (로그인 시 상주) ──
$BotScript = Join-Path $ScriptDir "advisor\bot.py"
$Action2 = New-ScheduledTaskAction -Execute $PythonwPath -Argument "`"$BotScript`"" -WorkingDirectory $ScriptDir
$Trigger2 = New-ScheduledTaskTrigger -AtLogOn
$Settings2 = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 30) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "참모총장봇" -Action $Action2 -Trigger $Trigger2 -Settings $Settings2 `
    -Description "디스코드 참모총장 대화 봇 (PC 켜져 있는 동안 상주)" -Force | Out-Null
Write-Host "[OK] '참모총장봇' 등록 완료 (로그인 시 자동 시작)" -ForegroundColor Green

Write-Host ""
Write-Host "지금 바로 시작하려면:"
Write-Host "  Start-ScheduledTask -TaskName '참모총장브리핑'"
Write-Host "  Start-ScheduledTask -TaskName '참모총장봇'"
Write-Host ""
Read-Host "Enter 키를 누르면 종료"
