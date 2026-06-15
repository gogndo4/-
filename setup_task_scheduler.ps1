# Windows 작업 스케줄러에 자존노트 동기화 작업 등록
# PowerShell을 관리자 권한으로 실행 후 이 스크립트를 실행하세요

# ─── 설정 ──────────────────────────────────────────────────────
$ScriptPath = "C:\경로\sync_esteem.py"   # sync_esteem.py 의 실제 경로로 변경
$PythonPath = "python"                    # Python 경로 (which python 으로 확인)
$TaskName   = "ObsidianSyncEsteem"
$TriggerTime = "05:00"                    # 실행 시각 (24시간 형식)
# ───────────────────────────────────────────────────────────────

$Action  = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Daily -At $TriggerTime
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -WakeToRun:$false

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Obsidian 데일리노트 자존노트를 0.나 노트에 매일 오전 5시 동기화" `
    -RunLevel Highest `
    -Force

Write-Host "[OK] 작업 스케줄러 등록 완료: '$TaskName' (매일 $TriggerTime)"
Write-Host "확인: 작업 스케줄러 > 작업 스케줄러 라이브러리 > $TaskName"
