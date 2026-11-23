<# : batch
@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ((Get-Content -LiteralPath $f -Encoding UTF8) -join [Environment]::NewLine)"
exit /b
#>
# OFFAIR 설치 — 방송실 서버 PC 에 위키(offair.bssmcast.com)를 처음 올리거나 새 main 으로 바꿀 때 실행
# 1) 온에어\OFFAIR-V2 에 GitHub main 을 받고 npm ci → next build
# 2) 'OFFAIR Autostart' 작업(로그온 40초 뒤 'OFFAIR 시작.cmd')을 만들고 지금 켠다 (포트 3020, 127.0.0.1 만)
# 3) 종·실시간 마이크·녹음 중이 아닐 때까지 기다린 뒤:
#    - 터널 설정(onair-cloudflared\config.yml)에 offair.bssmcast.com → 127.0.0.1:3020 을 넣고 터널만 다시 켠다
#    - ONAIR-SERVER\.env 의 CF_ACCESS_AUD 에 위키 Access 앱 AUD 를 덧붙이고 서버(8000)만 다시 켠다
# 0) CUE·MCP 가 위키를 읽는 같은 PC 내부 통로: 온에어\offair.env 에 OFFAIR_SERVICE_TOKEN 이 없으면 만들고,
#    ONAIR-SERVER\.env 에 OFFAIR_API_BASE·OFFAIR_SERVICE_TOKEN 을 맞춘다 (바뀌면 3) 에서 서버를 다시 켠다)
# AUD 는 $env:OFFAIR_AUD 로 미리 줄 수 있다 (없으면 물어본다).
# 바꾸는 파일은 모두 '.bak-offair' 사본을 남긴다. 기록은 온에어\offair-install-log.txt.
# 이 파일은 윗부분이 배치, 아랫부분이 PowerShell 인 한 파일짜리다 — BOM 없는 UTF-8, CRLF 로 저장할 것.
$host.UI.RawUI.WindowTitle = 'OFFAIR 설치'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$desk = [Environment]::GetFolderPath('Desktop')
$root = Join-Path $desk '온에어'
$app = Join-Path $root 'OFFAIR-V2'
$log = Join-Path $root 'offair-install-log.txt'
$port = 3020
$hostName = 'offair.bssmcast.com'
$MIN_GAP_MIN = 5

function Say([string]$msg, [string]$color = 'White') {
  Write-Host "  $msg" -ForegroundColor $color
  try { Add-Content -LiteralPath $log -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg) -Encoding UTF8 } catch {}
}
function Done([int]$code) { Write-Host ''; Read-Host '  엔터를 누르면 닫혀요'; exit $code }
function Api([string]$path) {
  try { return Invoke-RestMethod "http://127.0.0.1:8000$path" -TimeoutSec 5 } catch { return $null }
}
function Test-Port([int]$p) {
  return [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

Write-Host ''
Write-Host '  OFFAIR 설치' -ForegroundColor White
Write-Host ''
if (-not (Test-Path $root)) { Say "온에어 폴더를 못 찾았어요: $root" Red; Done 1 }
$aud = if ($env:OFFAIR_AUD) { $env:OFFAIR_AUD.Trim() } else { (Read-Host '  위키 Access 앱 AUD (건너뛰려면 엔터)').Trim() }
$restart = $false
$utf8 = New-Object Text.UTF8Encoding $false

# ---------- 0. CUE·MCP 가 위키를 읽는 통로 ----------
$offEnv = Join-Path $root 'offair.env'
$token = $null
if (Test-Path $offEnv) {
  $m = Select-String -LiteralPath $offEnv -Pattern '^\s*OFFAIR_SERVICE_TOKEN\s*=\s*(\S+)' | Select-Object -First 1
  if ($m) { $token = $m.Matches[0].Groups[1].Value }
}
if (-not $token) {
  $b = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $token = -join ($b | ForEach-Object { $_.ToString('x2') })
  if (Test-Path $offEnv) { Copy-Item -LiteralPath $offEnv -Destination "$offEnv.bak-offair" -Force }
  [IO.File]::AppendAllText($offEnv, "`r`nOFFAIR_SERVICE_TOKEN=$token`r`n", $utf8)
  Say 'offair.env 에 CUE 통로 토큰을 만들었어요' Green
}
$onEnv = Join-Path $root 'ONAIR-SERVER\.env'
if (Test-Path $onEnv) {
  $want = [ordered]@{ OFFAIR_API_BASE = "http://127.0.0.1:$port"; OFFAIR_SERVICE_TOKEN = $token }
  $ls = [Collections.Generic.List[string]](Get-Content -LiteralPath $onEnv -Encoding UTF8)
  $changed = $false
  foreach ($k in $want.Keys) {
    $line = "$k=$($want[$k])"
    $idx = 0..($ls.Count - 1) | Where-Object { $ls[$_] -match "^\s*$k\s*=" } | Select-Object -First 1
    if ($null -eq $idx) { $ls.Add($line); $changed = $true }
    elseif ($ls[$idx].Trim() -ne $line) { $ls[$idx] = $line; $changed = $true }
  }
  if ($changed) {
    Copy-Item -LiteralPath $onEnv -Destination "$onEnv.bak-offair-cue" -Force
    [IO.File]::WriteAllLines($onEnv, $ls, $utf8)
    $restart = $true
    Say 'ONAIR .env 에 위키 통로(OFFAIR_API_BASE·토큰)를 넣었어요 — 서버는 아래에서 다시 켜요' Green
  } else { Say 'ONAIR 위키 통로 설정은 이미 맞아요' Gray }
} else { Say "ONAIR .env 를 못 찾았어요: $onEnv — 위키 통로는 건너뛰어요" Yellow }

# ---------- 1. 받기·빌드 ----------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Say 'git 이 없어요.' Red; Done 1 }
$nodeV = (node -v 2>$null)
if (-not $nodeV) { Say 'node 가 없어요.' Red; Done 1 }
$nv = [version]($nodeV.TrimStart('v'))
if ($nv -lt [version]'20.9.0') { Say "node $nodeV 는 너무 낮아요 (20.9 이상 필요)." Red; Done 1 }
Say "node $nodeV" Gray

if (-not (Test-Path (Join-Path $app '.git'))) {
  Say 'GitHub 에서 받는 중' Gray
  git clone --quiet --branch main https://github.com/Broadcasting-System/OFFAIR-V2.git $app 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Say '받지 못했어요 (인터넷 확인).' Red; Done 1 }
} else {
  git -C $app fetch --quiet origin main 2>&1 | Out-Null
  $out = git -C $app merge --ff-only --quiet origin/main 2>&1
  if ($LASTEXITCODE -ne 0) { Say '새 main 을 받지 못했어요 — 이 PC 에서 고친 파일이 있어요.' Red; Say ($out -join ' ') Red; Done 1 }
}
Say ('받음: ' + (git -C $app log -1 --format='%h %s')) Green

Push-Location $app
try {
  Say '패키지 설치 중 (몇 분 걸려요)' Gray
  $env:npm_config_fetch_retries = '5'
  $env:npm_config_fetch_retry_mintimeout = '20000'
  $env:npm_config_fetch_retry_maxtimeout = '120000'
  for ($try = 1; $try -le 3; $try++) {
    $out = npm ci --no-audit --no-fund 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    if ($try -lt 3) { Say "패키지 설치 실패 ($try/3) — 30초 뒤 다시 해요" Yellow; Start-Sleep 30 }
  }
  if ($LASTEXITCODE -ne 0) { Say '패키지 설치 실패' Red; $out | Select-Object -Last 15 | ForEach-Object { Say "    $_" DarkRed }; Done 1 }
  Say '빌드 중 (3~5분)' Gray
  $out = npm run build 2>&1
  if ($LASTEXITCODE -ne 0) { Say '빌드 실패' Red; $out | Select-Object -Last 15 | ForEach-Object { Say "    $_" DarkRed }; Done 1 }
  Say '빌드 끝' Green
} finally { Pop-Location }

# ---------- 2. 자동 시작·지금 켜기 ----------
$start = Join-Path $app 'scripts\windows\OFFAIR 시작.cmd'
try {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $trigger.Delay = 'PT40S'
  $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$start`""
  Register-ScheduledTask -TaskName 'OFFAIR Autostart' -Trigger $trigger -Action $action -Force | Out-Null
  Say "작업 스케줄러 'OFFAIR Autostart' 등록" Green
} catch { Say "자동 시작 등록 실패 — 관리자 PowerShell 에서 다시 실행해 주세요: $($_.Exception.Message)" Yellow }

if (Test-Port $port) {
  Say "포트 $port 이 이미 열려 있어요 — 예전 위키를 끄고 새로 켜요" Gray
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("WindowTitle = 'OFFAIR 위키 ($port)'") } |
    ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null }
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { taskkill /PID $_.OwningProcess /T /F 2>&1 | Out-Null }
  Start-Sleep 2
}
Start-Process -FilePath $start -WindowStyle Minimized
$until = (Get-Date).AddSeconds(60)
while (-not (Test-Port $port) -and (Get-Date) -lt $until) { Start-Sleep 2 }
try {
  $r = Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 30
  Say "위키 켜짐 (127.0.0.1:$port → $($r.StatusCode))" Green
} catch { Say "위키가 안 켜졌어요 — 작업 표시줄의 'OFFAIR 위키 ($port)' 창을 확인하세요" Red; Done 1 }

if (-not $aud) { Say 'AUD 를 안 넣어서 터널·ONAIR 설정은 건너뛰어요.' Yellow; Done 0 }

# ---------- 3. 종·방송이 없을 때까지 기다리기 ----------
function Busy {
  $jobs = Api '/api/time/jobs'
  if ($jobs) {
    $next = $jobs | Where-Object { $_.id -like 'bell_*' -and $_.next_run_time } |
      ForEach-Object { [DateTimeOffset]::Parse($_.next_run_time) } | Sort-Object | Select-Object -First 1
    if ($next) {
      $gap = ($next - [DateTimeOffset]::Now).TotalMinutes
      if ($gap -lt $MIN_GAP_MIN -and $gap -gt -2) { return ('다음 종 {0}' -f $next.ToLocalTime().ToString('HH:mm:ss')) }
    }
  }
  $live = Api '/api/broadcast/live/status'
  if ($live -and $live.active) { return '실시간 마이크 방송 중' }
  $av = Api '/api/av/state'
  if ($av -and $av.session) { return '녹음·녹화 중' }
  return $null
}
while ($why = Busy) { Say "$why — 끝날 때까지 기다려요" Yellow; Start-Sleep 20 }

# ---------- 4. 터널에 주소 넣기 ----------
$cfDir = Join-Path $env:USERPROFILE 'onair-cloudflared'
$cfg = Join-Path $cfDir 'config.yml'
$cf = Join-Path $cfDir 'cloudflared.exe'
if (-not (Test-Path $cfg)) { Say "터널 설정을 못 찾았어요: $cfg" Red; Done 1 }
$lines = [Collections.Generic.List[string]](Get-Content -LiteralPath $cfg -Encoding UTF8)
if ($lines -match [regex]::Escape($hostName)) {
  Say '터널 설정에 이미 위키 주소가 있어요' Gray
} else {
  $i = 0..($lines.Count - 1) | Where-Object { $lines[$_] -match '^\s*-\s*service:\s*http_status' } | Select-Object -First 1
  if ($null -eq $i) { Say '터널 설정에서 마지막 줄(http_status)을 못 찾았어요 — 손대지 않아요.' Red; Done 1 }
  $indent = ($lines[$i] -replace '-.*$', '')
  Copy-Item -LiteralPath $cfg -Destination "$cfg.bak-offair" -Force
  $lines.Insert($i, "$indent  service: http://127.0.0.1:$port")
  $lines.Insert($i, "$indent- hostname: $hostName")
  [IO.File]::WriteAllLines($cfg, $lines, (New-Object Text.UTF8Encoding $false))
  if (Test-Path $cf) {
    $check = & $cf tunnel --config $cfg ingress validate 2>&1
    if ($LASTEXITCODE -ne 0) {
      Copy-Item -LiteralPath "$cfg.bak-offair" -Destination $cfg -Force
      Say '터널 설정 확인 실패 — 원래대로 되돌렸어요.' Red; $check | ForEach-Object { Say "    $_" DarkRed }; Done 1
    }
  }
  Say '터널 설정에 위키 주소를 넣었어요' Green

  $tn = 'ONAIR Cloudflare Tunnel'
  $task = Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue
  Say '터널 다시 켜는 중 (몇 초 끊김)' Gray
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep 2
  if ($task) { try { Start-ScheduledTask -TaskName $tn } catch {} }
  $until = (Get-Date).AddSeconds(20)
  while (-not (Get-Process cloudflared -ErrorAction SilentlyContinue) -and (Get-Date) -lt $until) { Start-Sleep 1 }
  if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue) -and $task) {
    $a = $task.Actions | Select-Object -First 1
    Start-Process -FilePath $a.Execute -ArgumentList $a.Arguments -WindowStyle Hidden
    Start-Sleep 5
  }
  if (Get-Process cloudflared -ErrorAction SilentlyContinue) { Say '터널 켜짐' Green } else { Say '터널이 안 켜졌어요 — 바로 확인해야 해요!' Red; Done 1 }
}

# ---------- 5. ONAIR 가 위키 로그인을 알아보게 ----------
$envFile = Join-Path $root 'ONAIR-SERVER\.env'
if (-not (Test-Path $envFile)) { Say "ONAIR .env 를 못 찾았어요: $envFile" Red; Done 1 }
$envLines = [Collections.Generic.List[string]](Get-Content -LiteralPath $envFile -Encoding UTF8)
$j = 0..($envLines.Count - 1) | Where-Object { $envLines[$_] -match '^\s*CF_ACCESS_AUD\s*=' } | Select-Object -First 1
if ($null -ne $j -and $envLines[$j].Contains($aud)) {
  Say 'ONAIR 에 이미 위키 AUD 가 있어요' Gray
} else {
  Copy-Item -LiteralPath $envFile -Destination "$envFile.bak-offair" -Force
  if ($null -eq $j) { $envLines.Add("CF_ACCESS_AUD=$aud") }
  else {
    $cur = ($envLines[$j] -replace '^\s*CF_ACCESS_AUD\s*=\s*', '').Trim().Trim('"')
    $envLines[$j] = 'CF_ACCESS_AUD=' + $(if ($cur) { "$cur,$aud" } else { $aud })
  }
  [IO.File]::WriteAllLines($envFile, $envLines, (New-Object Text.UTF8Encoding $false))
  Say 'ONAIR .env 에 위키 AUD 를 덧붙였어요' Green
  $restart = $true
}
if (-not $restart) {
  Say 'ONAIR 서버는 그대로 둬요' Gray
} else {
  while ($why = Busy) { Say "$why — 끝날 때까지 기다려요" Yellow; Start-Sleep 20 }
  Say 'ONAIR 서버만 다시 켜는 중 (1분쯤)' Gray
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("WindowTitle = 'ONAIR 서버 (8000)'") } |
    ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null }
  Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { taskkill /PID $_.OwningProcess /T /F 2>&1 | Out-Null }
  $until = (Get-Date).AddSeconds(15)
  while ((Test-Port 8000) -and (Get-Date) -lt $until) { Start-Sleep 1 }
  $onairStart = Join-Path $desk 'ONAIR 시작.cmd'
  if (-not (Test-Path $onairStart)) { Say "바탕화면에 'ONAIR 시작.cmd' 가 없어요. 손으로 켜 주세요!" Red; Done 1 }
  Start-Process -FilePath $onairStart -WindowStyle Minimized
  $until = (Get-Date).AddSeconds(120)
  while (-not (Test-Port 8000) -and (Get-Date) -lt $until) { Start-Sleep 2 }
  if (-not (Test-Port 8000)) { Say "ONAIR 서버가 안 켜졌어요 — 'ONAIR 서버 (8000)' 창을 확인하세요!" Red; Done 1 }
  Start-Sleep 5
  $bells = @(Api '/api/time/jobs' | Where-Object { $_.id -like 'bell_*' })
  if ($bells.Count) { Say "ONAIR 서버 켜짐 · 시보 $($bells.Count)개 다시 걸림" Green }
  else { Say 'ONAIR 서버는 켜졌는데 시보가 안 걸려 있어요 — 시보 화면에서 확인해 주세요.' Red; Done 1 }
}

Write-Host ''
Say "설치 끝 — https://$hostName" Green
Done 0
