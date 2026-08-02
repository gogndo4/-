# 내 PC 자동화 시스템 전체 진단 스크립트
# 목적: 예전에 만들어두고 어디서 어떻게 돌아가는지 모르는 자동화들을 전부 찾아낸다.
# 사용법: PowerShell을 열고 이 폴더에서 실행 →  .\diagnose_system.ps1
#         (관리자 권한 불필요. 완료되면 바탕화면에 리포트 파일이 생긴다)
# 생성된 "시스템진단리포트.txt" 내용을 클로드 채팅에 붙여넣으면 전체 시스템을 분석해준다.

$Report = Join-Path ([Environment]::GetFolderPath("Desktop")) "시스템진단리포트.txt"
$Out = New-Object System.Collections.Generic.List[string]
$Out.Add("===== 시스템 진단 리포트 =====")
$Out.Add("생성: $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
$Out.Add("컴퓨터: $env:COMPUTERNAME / 사용자: $env:USERNAME")
$Out.Add("")

# ── 1. 작업 스케줄러 (마이크로소프트 기본 작업 제외) ──
$Out.Add("========== 1. 작업 스케줄러에 등록된 자동화 ==========")
try {
    $tasks = Get-ScheduledTask | Where-Object { $_.TaskPath -notlike "\Microsoft*" }
    foreach ($t in $tasks) {
        $info = $t | Get-ScheduledTaskInfo
        $Out.Add("● [$($t.State)] $($t.TaskPath)$($t.TaskName)")
        if ($t.Description) { $Out.Add("   설명: $($t.Description)") }
        foreach ($a in $t.Actions) {
            $Out.Add("   실행: $($a.Execute) $($a.Arguments)")
            if ($a.WorkingDirectory) { $Out.Add("   폴더: $($a.WorkingDirectory)") }
        }
        foreach ($tr in $t.Triggers) {
            $trType = $tr.CimClass.CimClassName -replace 'MSFT_Task', '' -replace 'Trigger', ''
            $Out.Add("   트리거: $trType $($tr.StartBoundary)")
        }
        $Out.Add("   마지막 실행: $($info.LastRunTime) (결과 코드: $($info.LastTaskResult)) / 다음 실행: $($info.NextRunTime)")
        $Out.Add("")
    }
    if (-not $tasks) { $Out.Add("(없음)"); $Out.Add("") }
} catch { $Out.Add("[오류] $_"); $Out.Add("") }

# ── 2. 시작 프로그램 ──
$Out.Add("========== 2. 시작 프로그램 (로그인 시 자동 실행) ==========")
foreach ($dir in @(
    [Environment]::GetFolderPath("Startup"),
    [Environment]::GetFolderPath("CommonStartup")
)) {
    if (Test-Path $dir) {
        Get-ChildItem $dir -ErrorAction SilentlyContinue | ForEach-Object { $Out.Add("● $($_.FullName)") }
    }
}
foreach ($key in @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Run", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run")) {
    try {
        $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
        $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
            $Out.Add("● [레지스트리] $($_.Name) = $($_.Value)")
        }
    } catch {}
}
$Out.Add("")

# ── 3. 옵시디언 볼트와 플러그인 ──
$Out.Add("========== 3. 옵시디언 볼트 ==========")
$roots = @("$env:USERPROFILE\Documents", "$env:USERPROFILE\OneDrive", "$env:USERPROFILE\iCloudDrive", "$env:USERPROFILE") | Where-Object { Test-Path $_ }
$vaults = @()
foreach ($root in $roots) {
    $vaults += Get-ChildItem $root -Recurse -Directory -Filter ".obsidian" -Depth 4 -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Parent } | Where-Object { $vaults -notcontains $_.FullName }
}
foreach ($v in ($vaults | Select-Object -Unique -First 5)) {
    $Out.Add("● 볼트: $($v.FullName)")
    $plugFile = Join-Path $v.FullName ".obsidian\community-plugins.json"
    if (Test-Path $plugFile) { $Out.Add("   설치 플러그인: $(Get-Content $plugFile -Raw)") }
    $plugDir = Join-Path $v.FullName ".obsidian\plugins"
    if (Test-Path $plugDir) {
        Get-ChildItem $plugDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $dataFile = Join-Path $_.FullName "data.json"
            $hasData = if (Test-Path $dataFile) { "data.json 있음 ($([math]::Round((Get-Item $dataFile).Length/1KB))KB, 수정 $((Get-Item $dataFile).LastWriteTime.ToString('MM-dd')))" } else { "data.json 없음" }
            $Out.Add("   - 플러그인 폴더: $($_.Name) [$hasData]")
        }
    }
    $topDirs = Get-ChildItem $v.FullName -Directory -ErrorAction SilentlyContinue | Select-Object -First 15 | ForEach-Object { $_.Name }
    $Out.Add("   최상위 폴더: $($topDirs -join ', ')")
    $Out.Add("")
}
if (-not $vaults) { $Out.Add("(볼트를 찾지 못함)"); $Out.Add("") }

# ── 4. 자동화 스크립트 파일 (최근 1년 내 수정) ──
$Out.Add("========== 4. 흩어져 있는 스크립트 파일 ==========")
$cutoff = (Get-Date).AddYears(-1)
foreach ($root in @("$env:USERPROFILE\Documents", "$env:USERPROFILE\Desktop", "$env:USERPROFILE\Downloads")) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem $root -Recurse -Depth 3 -Include *.py, *.ps1, *.bat, *.ahk -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $cutoff -and $_.FullName -notmatch 'node_modules|\.git|site-packages' } |
        Select-Object -First 60 | ForEach-Object {
            $Out.Add("● $($_.FullName)  (수정: $($_.LastWriteTime.ToString('yyyy-MM-dd')))")
        }
}
$Out.Add("")

# ── 5. 실행 환경 ──
$Out.Add("========== 5. 실행 환경 ==========")
try { $Out.Add("Python: $(python --version 2>&1)  경로: $((Get-Command python -ErrorAction SilentlyContinue).Source)") } catch { $Out.Add("Python 없음") }
try { $Out.Add("Node: $(node --version 2>&1)") } catch { $Out.Add("Node 없음") }
try { $Out.Add("Claude CLI: $((Get-Command claude -ErrorAction SilentlyContinue).Source)") } catch {}
$Out.Add("")
$Out.Add("===== 리포트 끝 — 이 파일 내용을 통째로 클로드에게 붙여넣어 주세요 =====")

$Out | Set-Content -Path $Report -Encoding UTF8
Write-Host ""
Write-Host "[완료] 리포트 생성: $Report" -ForegroundColor Green
Write-Host "이 파일을 열어 내용을 클로드 채팅에 붙여넣으면 전체 시스템을 분석해줍니다."
Read-Host "Enter 키를 누르면 종료"
