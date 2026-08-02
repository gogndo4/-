# 스레드 초안 자동 생성 - Windows 작업 스케줄러 등록 스크립트
# PowerShell을 관리자 권한으로 실행 후 이 파일이 있는 폴더에서 실행하세요:
#   .\setup_threads_scheduler.ps1

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ScriptDir "draft_threads.py"
$TaskName   = "ObsidianThreadDrafts"
$TriggerTime = "05:10"

# Python 경로 자동 감지
$PythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonPath) {
    $PythonPath = (Get-Command python3 -ErrorAction SilentlyContinue).Source
}
if (-not $PythonPath) {
    Write-Host "[ERROR] Python을 찾을 수 없습니다. Python을 설치하거나 PATH에 추가해주세요." -ForegroundColor Red
    exit 1
}

Write-Host "Python 경로: $PythonPath"
Write-Host "스크립트 경로: $ScriptPath"

$Action = New-ScheduledTaskAction `
    -Execute $PythonPath `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory $ScriptDir

$Trigger = New-ScheduledTaskTrigger -Daily -At $TriggerTime

$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -WakeToRun:$false `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "데일리노트 기록으로 스레드 초안을 매일 오전 5시 10분 자동 생성" `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host ""
Write-Host "[OK] 작업 스케줄러 등록 완료!" -ForegroundColor Green
Write-Host "  - 작업 이름: $TaskName"
Write-Host "  - 실행 시각: 매일 오전 $TriggerTime"
Write-Host ""
Write-Host "지금 바로 테스트하려면:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Read-Host "Enter 키를 누르면 종료"
