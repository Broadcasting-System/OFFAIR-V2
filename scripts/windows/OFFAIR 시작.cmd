<# : batch
@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ((Get-Content -LiteralPath $f -Encoding UTF8) -join [Environment]::NewLine)"
exit /b
#>
# OFFAIR 시작 — 방송실 서버 PC 에서 위키를 켠다 (작업 스케줄러 'OFFAIR Autostart' 가 로그온 때 부름)
# 최소화된 창 하나로 'next start' 를 띄우고, 꺼지면 5초 뒤 다시 켠다. 이미 포트가 열려 있으면 건너뛴다.
# 설정을 바꾸려면 '온에어\offair.env' 에 KEY=VALUE 줄을 넣는다 (아래 기본값을 덮어씀).
# 켜기 전에 개발 문서 씨앗(온에어\ONAIR-SERVER\docs\offair-dev)이 있으면 위키로 가져온다 (아래 '개발 문서 씨앗').
# 이 파일은 윗부분이 배치, 아랫부분이 PowerShell 인 한 파일짜리다 — BOM 없는 UTF-8, CRLF 로 저장할 것.
$app = (Resolve-Path (Join-Path ([IO.Path]::GetDirectoryName($f)) '..\..')).Path
$root = Split-Path $app -Parent
$port = 3020
$title = "OFFAIR 위키 ($port)"

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "$title 이미 켜져 있음"; exit 0
}
if (-not (Test-Path (Join-Path $app '.next\BUILD_ID'))) {
  Write-Host "빌드가 없어요. 'OFFAIR 설치.cmd' 를 먼저 실행하세요." -ForegroundColor Red; Start-Sleep 10; exit 1
}

$envs = [ordered]@{
  ONAIR_API_BASE         = 'http://127.0.0.1:8000'
  OFFAIR_PUBLIC_URL      = 'https://offair.bssmcast.com'
  OFFAIR_ALLOWED_ORIGINS = 'offair.bssmcast.com'
  OFFAIR_DATA_DIR        = (Join-Path $root 'offair-data')
  OFFAIR_GIT_PUSH        = '0'
}
$extra = Join-Path $root 'offair.env'
if (Test-Path $extra) {
  foreach ($line in Get-Content -LiteralPath $extra -Encoding UTF8) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $envs[$Matches[1]] = $Matches[2].Trim() }
  }
}
$set = ($envs.GetEnumerator() | ForEach-Object { "`$env:$($_.Key) = '$($_.Value -replace "'", "''")'" }) -join '; '

# ---------- 개발 문서 씨앗 ----------
# ONAIR 서버 저장소의 docs\offair-dev 가 있으면 위키를 켜기 전에 한 번 가져온다 (scripts\import-dev-docs.ts).
# 바뀐 문서만 한 커밋으로 넣고, 아무것도 지우지 않고, 위키에서 고친 문서는 그대로 둔다. 실패해도 위키는 켠다.
# 다른 폴더는 offair.env 에 OFFAIR_DEV_DOCS_SEED=<폴더>, 끄려면 OFFAIR_DEV_DOCS_SEED= (빈 값). 기록은 온에어\offair-import-log.txt.
$seed = if ($envs.Contains('OFFAIR_DEV_DOCS_SEED')) { $envs['OFFAIR_DEV_DOCS_SEED'] } else { Join-Path $root 'ONAIR-SERVER\docs\offair-dev' }
if ($seed -and (Test-Path -LiteralPath $seed -PathType Container)) {
  $importLog = Join-Path $root 'offair-import-log.txt'
  try {
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    foreach ($kv in $envs.GetEnumerator()) { Set-Item -LiteralPath "env:$($kv.Key)" -Value $kv.Value }
    Push-Location $app
    try {
      $out = @(& node --import tsx scripts\import-dev-docs.ts $seed 2>&1 | ForEach-Object { "$_" })
      $code = $LASTEXITCODE
    } finally { Pop-Location }
    $stamp = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] 개발 문서 가져오기 (종료 코드 $code)"
    Add-Content -LiteralPath $importLog -Value (@($stamp) + $out) -Encoding UTF8
    $color = if ($code -eq 0) { 'Gray' } else { 'Yellow' }
    $out | Select-Object -Last 1 | ForEach-Object { Write-Host "개발 문서 가져오기: $_" -ForegroundColor $color }
  } catch { Write-Host "개발 문서 가져오기 실패: $($_.Exception.Message)" -ForegroundColor Yellow }
}

$loop = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$app'; $set; " +
        "while (`$true) { node node_modules\next\dist\bin\next start --hostname 127.0.0.1 --port $port; " +
        "Write-Host ('[' + (Get-Date -Format 'HH:mm:ss') + '] 꺼짐 — 5초 뒤 다시 켬'); Start-Sleep 5 }"
Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $loop
Write-Host "$title 시작"
